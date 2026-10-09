<script setup lang="ts">
// CloudWatch Logs: log groups (read a page at a time until all are in), a group's streams, a
// stream's latest thousand events with find and JSON pretty-printing, a pattern search over the
// last hour, day or week, and live tail: in the window, or with aws logs tail in a terminal.
import type { LogEvent, LogGroup, LogStream, LogTailMsg } from '#shared/aws'
import type { AwsLine } from '~/utils/aws'

const A = useAwsStore()
const prefs = usePrefsStore()

// ---------- Groups, a page at a time ----------

const groups = ref<LogGroup[] | null>(null)
const next = ref<string | null>(null)
const groupsBusy = ref(false)
const groupsError = ref('')
const groupsAt = ref(0)
let readN = 0

/** Reads the first page, then the rest one after another, as aws-tui does; or carries on after a failed page. */
async function loadGroups(force: boolean, resume = false) {
  const mine = ++readN
  groupsBusy.value = true
  let token: string | null = resume ? next.value : null
  const out: LogGroup[] = resume ? [...(groups.value || [])] : []
  for (let i = 0; i < 400; i++) {
    const r = await A.call(api.aws.logGroups(A.c(), token, force))
    if (mine !== readN) return
    if (!r.ok) {
      groupsError.value = r.error
      break
    }
    groupsError.value = ''
    out.push(...r.data.groups)
    groups.value = [...out]
    groupsAt.value = r.at || Date.now()
    token = r.data.next
    next.value = token
    if (!token) break
  }
  groupsBusy.value = false
}

type Mode = 'groups' | 'streams' | 'events' | 'search' | 'results' | 'tail'
const mode = ref<Mode>('groups')
const group = ref<LogGroup | null>(null)
/** Where a live tail or a search was started from, the groups or a group's streams, for going back. */
const from = ref<'groups' | 'streams'>('groups')

const gt = useAwsTable<LogGroup>({
  rows: () => groups.value || [],
  columns: () => [
    { key: 'name', label: 'Log group', value: g => g.name, flex: true, mono: true },
    { key: 'retention', label: 'Retention', value: g => g.retention, text: g => (g.retention ? `${g.retention} day${g.retention === 1 ? '' : 's'}` : 'Never'), sort: 'num' },
    { key: 'size', label: 'Size', value: g => g.bytes, text: g => bytes(g.bytes), sort: 'num', align: 'right' },
  ],
  filter: (g, q) => matches(q, g.name),
  active: () => mode.value === 'groups',
  open: g => openStreams(g),
  openHint: 'streams',
  keys: g => ({
    awsRefresh: { run: () => loadGroups(true) },
    awsLogMore: { run: () => { if (next.value && !groupsBusy.value) loadGroups(false, true) } },
    ...(g ? groupKeys(g) : {}),
  }),
})

function groupKeys(g: LogGroup) {
  return {
    awsLogTail: { run: () => startTail(g), hint: 'live tail' },
    awsLogTailCli: { run: () => A.openTerm('tail', `Tail · ${g.name}`, { group: g.name }) },
    awsLogSearch: { run: () => openSearch(g), hint: 'search' },
    awsBookmark: { run: () => A.toggleBookmark('Logs', g.name, g.name) },
    awsRelated: { run: () => A.related(logLinks(g)), hint: 'related' },
    awsCopy: { run: () => A.choose('Copy', [
      { key: 'n', label: 'name', run: () => copyText(g.name) },
      { key: 'a', label: 'ARN', run: () => copyText(g.arn) },
    ]) },
  }
}

// ---------- Streams ----------

const streams = useAwsLoad((ctx, name: string, force: boolean) => api.aws.logStreams(ctx, name, force))
/** Whose streams those are. */
const streamsOf = ref('')

function openStreams(g: LogGroup) {
  group.value = g
  mode.value = 'streams'
  st.query.value = ''
  // Another group's streams never show while this one's are read.
  if (group.value?.name !== streamsOf.value) streams.data.value = null
  streamsOf.value = g.name
  streams.load(g.name, false)
}

const st = useAwsTable<LogStream>({
  rows: () => streams.data.value || [],
  columns: () => [
    { key: 'name', label: 'Stream', value: s => s.name, flex: true, mono: true },
    { key: 'last', label: 'Last event', value: s => s.lastEvent, text: s => awsTime(s.lastEvent), sort: 'time' },
  ],
  filter: (s, q) => matches(q, s.name),
  active: () => mode.value === 'streams',
  open: s => openEvents(s),
  openHint: 'events',
  back: () => { mode.value = 'groups' },
  keys: () => (group.value ? {
    awsRefresh: { run: () => streams.load(group.value!.name, true) },
    awsLogTail: { run: () => startTail(group.value!), hint: 'live tail' },
    awsLogSearch: { run: () => openSearch(group.value!), hint: 'search' },
  } : {}),
})

// ---------- A stream's events, and search results ----------

const stream = ref<string>('')
const events = useAwsLoad((ctx, g: string, s: string) => api.aws.logEvents(ctx, g, s))
const json = ref(false)
const find = ref('')
const findAt = ref(0)
const finding = ref(false)
const findInput = ref<HTMLInputElement | null>(null)
const lines = ref<{ count: number; scroll: (h: any) => void } | null>(null)

function openEvents(s: LogStream) {
  stream.value = s.name
  mode.value = 'events'
  find.value = ''
  events.data.value = null
  events.load(group.value!.name, s.name)
}

const toLine = (e: LogEvent): AwsLine => ({ pre: awsClock(e.at), tag: e.stream.slice(0, 14), text: e.message })
const eventLines = computed(() => (events.data.value || []).map(toLine))

const RANGES = [{ label: 'last 1h', ms: 3_600_000 }, { label: 'last 24h', ms: 86_400_000 }, { label: 'last 7d', ms: 7 * 86_400_000 }]
const pattern = ref('')
const range = ref(0)
const patternInput = ref<HTMLInputElement | null>(null)
const results = useAwsLoad((ctx, g: string, p: string, start: number, end: number) => api.aws.logSearch(ctx, g, p, start, end))
const resultLines = computed(() => (results.data.value?.events || []).map(toLine))

function openSearch(g: LogGroup) {
  from.value = mode.value === 'streams' && group.value?.name === g.name ? 'streams' : 'groups'
  group.value = g
  mode.value = 'search'
  nextTick(() => patternInput.value?.focus())
}

function runSearch() {
  const end = Date.now()
  mode.value = 'results'
  find.value = ''
  results.load(group.value!.name, pattern.value, end - RANGES[range.value]!.ms, end)
  focusAwsWindow()
}

function onPatternKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    runSearch()
  } else if (e.key === 'Tab') {
    e.preventDefault()
    range.value = (range.value + (e.shiftKey ? RANGES.length - 1 : 1)) % RANGES.length
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    mode.value = from.value
    focusAwsWindow()
  }
}

const plain = (l: AwsLine[]) => l.map(x => `${x.pre || ''} ${x.tag ? `[${x.tag}] ` : ''}${x.text}`).join('\n')

function openFind() {
  finding.value = true
  nextTick(() => findInput.value?.focus())
}

function stepFind(d: number) {
  const n = lines.value?.count || 0
  if (n) findAt.value = (findAt.value + d + n) % n
}

function onFindKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    finding.value = false
    focusAwsWindow()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    find.value = ''
    finding.value = false
    focusAwsWindow()
  }
}
watch(find, () => { findAt.value = 0 })

// ---------- Live tail ----------

const MAX_TAIL = 5000
const tailId = ref<string | null>(null)
const tail = ref<LogEvent[]>([])
const parked = ref<LogEvent[]>([])
const paused = ref(false)
const tailState = ref<'starting' | 'live' | 'ended' | 'error'>('starting')
const tailError = ref('')
const tailStarted = ref(0)
const tailFilter = ref('')
let off: (() => void) | null = null

function startTail(g: LogGroup) {
  stopTail()
  from.value = mode.value === 'streams' && group.value?.name === g.name ? 'streams' : 'groups'
  group.value = g
  mode.value = 'tail'
  tail.value = []
  parked.value = []
  paused.value = false
  tailFilter.value = ''
  tailState.value = 'starting'
  tailError.value = ''
  tailStarted.value = Date.now()
  const id = `tail-${Date.now().toString(36)}`
  tailId.value = id
  off = api.aws.onTail((m: LogTailMsg) => {
    if (m.id !== tailId.value) return
    if (m.state) {
      tailState.value = m.state === 'live' ? 'live' : m.state
      if (m.error) tailError.value = m.error
    }
    if (m.events?.length) {
      if (paused.value) parked.value = [...parked.value, ...m.events].slice(-MAX_TAIL)
      else tail.value = [...tail.value, ...m.events].slice(-MAX_TAIL)
    }
  })
  api.aws.tailStart(A.c(), id, g.arn)
}

function stopTail() {
  if (tailId.value) api.aws.tailStop(tailId.value)
  tailId.value = null
  off?.()
  off = null
}

function togglePause() {
  paused.value = !paused.value
  if (!paused.value && parked.value.length) {
    tail.value = [...tail.value, ...parked.value].slice(-MAX_TAIL)
    parked.value = []
  }
}

/** The local filter is a regular expression; one that doesn't parse matches as plain text. */
const tailRe = computed(() => {
  const f = tailFilter.value.trim()
  if (!f) return null
  try {
    return new RegExp(f, 'i')
  } catch {
    return new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
})
const tailLines = computed(() => tail.value.filter(e => !tailRe.value || tailRe.value.test(e.message)).map(toLine))

function leaveTail() {
  stopTail()
  mode.value = from.value
}

onBeforeUnmount(stopTail)
onDeactivated(() => { if (mode.value === 'tail' && !paused.value) togglePause() })

// ---------- Keys for the line views ----------

const scrollKeys = () => ({
  awsDown: { run: () => lines.value?.scroll('down') },
  awsUp: { run: () => lines.value?.scroll('up') },
  awsPageDown: { run: () => lines.value?.scroll('pageDown') },
  awsPageUp: { run: () => lines.value?.scroll('pageUp') },
  awsTop: { run: () => lines.value?.scroll('top') },
  awsBottom: { run: () => lines.value?.scroll('bottom') },
})

useAwsKeys(() => {
  const m = mode.value
  if (m === 'events' || m === 'results') {
    const shown = m === 'events' ? eventLines.value : resultLines.value
    return {
      keys: {
        ...scrollKeys(),
        awsBack: { run: () => (find.value ? (find.value = '') : (mode.value = m === 'events' ? 'streams' : 'search')) },
        awsFilter: { run: openFind, hint: 'find' },
        awsLogNext: { run: () => stepFind(1), hint: 'next' },
        awsLogPrev: { run: () => stepFind(-1) },
        awsLogJson: { run: () => { json.value = !json.value }, hint: 'json' },
        awsCopy: { run: () => copyText(plain(shown), `${shown.length} lines copied`), hint: 'copy all' },
        awsRefresh: { run: () => (m === 'events' ? events.load(group.value!.name, stream.value) : runSearch()) },
      },
    }
  }
  if (m === 'tail') {
    return {
      keys: {
        ...scrollKeys(),
        awsBack: { run: leaveTail },
        awsFilter: { run: openFind, hint: 'filter' },
        awsLogPause: { run: togglePause, hint: paused.value ? 'resume' : 'pause' },
        awsLogClear: { run: () => { tail.value = [] }, hint: 'clear' },
        awsLogJson: { run: () => { json.value = !json.value }, hint: 'json' },
        awsCopy: { run: () => copyText(plain(tailLines.value), `${tailLines.value.length} lines copied`), hint: 'copy' },
      },
    }
  }
  if (m === 'search') return { keys: { awsBack: { run: () => { mode.value = from.value } } } }
  return { keys: {} }
})

useAwsJump('Logs', (q) => {
  stopTail()
  mode.value = 'groups'
  gt.query.value = q
})

onMounted(() => loadGroups(false))
</script>

<template>
  <AwsGrid
    v-if="mode === 'groups'"
    :t="gt"
    title="CloudWatch log groups"
    :sub="groupsBusy && next ? 'reading more…' : ''"
    :busy="groupsBusy"
    :error="groupsError"
    :at="groupsAt"
    :waiting="!groups"
    :row-key="g => g.name"
    empty="No log groups in this region."
    @open="openStreams"
    @refresh="loadGroups(true)"
  >
    <template #cell-name="{ row }">
      <div class="ellipsis">{{ row.name }}<span v-if="A.isBookmarked('Logs', row.name)" class="ml-1.5 text-(--amb)">★</span></div>
    </template>
  </AwsGrid>

  <AwsGrid
    v-else-if="mode === 'streams' && group"
    :t="st"
    :title="group.name"
    :busy="streams.busy.value"
    :error="streams.error.value"
    :at="streams.at.value"
    :waiting="!streams.data.value"
    :row-key="s => s.name"
    empty="No streams in this group."
    @open="openEvents"
    @refresh="streams.load(group.name, true)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'groups'" />
    </template>
    <template #actions>
      <UButton size="xs" color="neutral" variant="subtle" label="Search" @click="openSearch(group)" />
      <UButton size="xs" color="primary" variant="subtle" label="Live tail" @click="startTail(group)" />
    </template>
  </AwsGrid>

  <div v-else-if="mode === 'search' && group" class="min-h-0 flex-1 overflow-auto">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = from" />
      <span class="text-[13px] font-semibold">Search {{ group.name }}</span>
    </div>
    <div class="flex max-w-[720px] flex-col gap-3 px-5 py-5">
      <input
        ref="patternInput"
        v-model="pattern"
        placeholder='A filter pattern: ERROR, "timed out", { $.level = "error" }… or leave empty for everything'
        class="mono h-[32px] rounded-md border border-(--ln) bg-(--inp) px-3 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)"
        @keydown="onPatternKey"
      >
      <div class="flex items-center gap-2">
        <Seg v-model="range" size="sm" :items="RANGES.map((r, i) => ({ label: r.label, value: i }))" />
        <span class="text-[11.5px] text-(--fa)">Tab changes the range · Enter searches</span>
        <div class="flex-1" />
        <UButton size="sm" color="primary" label="Search" @click="runSearch" />
      </div>
    </div>
  </div>

  <div v-else-if="(mode === 'events' || mode === 'results' || mode === 'tail') && group" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode === 'tail' ? leaveTail() : (mode = mode === 'events' ? 'streams' : 'search')" />
      <template v-if="mode === 'events'">
        <span class="mono ellipsis text-[12.5px] font-semibold">{{ stream }}</span>
        <span class="text-[11.5px] text-(--fa)">{{ eventLines.length }} events</span>
      </template>
      <template v-else-if="mode === 'results'">
        <span class="mono ellipsis text-[12.5px] font-semibold">{{ group.name }}</span>
        <span class="text-[11.5px] text-(--fa)">{{ RANGES[range]!.label }}{{ pattern ? ` · ${pattern}` : '' }} · {{ resultLines.length }} matches</span>
        <span v-if="results.data.value?.more" class="text-[11.5px] text-(--amb)">more available, narrow the time or pattern</span>
      </template>
      <template v-else>
        <span class="mono ellipsis text-[12.5px] font-semibold">{{ group.name }}</span>
        <span class="flex items-center gap-1 text-[11.5px]" :class="paused ? 'text-(--amb)' : tailState === 'live' ? 'text-(--grn)' : tailState === 'error' ? 'text-(--red)' : 'text-(--fa)'">
          <span class="h-1.5 w-1.5 rounded-full bg-current" :class="tailState === 'live' && !paused && 'animate-pulse'" />
          {{ paused ? `paused · ${parked.length} waiting` : tailState }}
        </span>
        <span class="text-[11.5px] text-(--fa)">{{ tail.length }} lines · started {{ awsClock(tailStarted) }}</span>
        <span v-if="tailError" class="ellipsis text-[11.5px] text-(--red)">{{ tailError }}</span>
      </template>
      <div class="flex-1" />
      <span v-if="json" class="text-[11px] text-(--lnk)">json</span>
      <span v-if="find && mode !== 'tail'" class="text-[11px] text-(--fa)">match {{ (lines?.count || 0) ? findAt + 1 : 0 }}/{{ lines?.count || 0 }}</span>
      <UButton v-if="mode === 'tail'" size="xs" color="neutral" variant="subtle" :label="paused ? 'Resume' : 'Pause'" @click="togglePause" />
      <UButton v-if="mode === 'tail'" size="xs" color="neutral" variant="subtle" label="In a terminal" title="aws logs tail --follow" @click="A.openTerm('tail', `Tail · ${group.name}`, { group: group.name })" />
    </div>
    <div v-if="finding || (mode === 'tail' ? tailFilter : find)" class="flex h-9 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <span class="mono text-[12px] text-(--lnk)">/</span>
      <input
        v-if="mode === 'tail'"
        ref="findInput"
        v-model="tailFilter"
        class="mono h-7 flex-1 bg-transparent text-[12px] text-(--tx) outline-none placeholder:text-(--fa)"
        placeholder="filter lines (a regular expression)"
        @keydown="onFindKey"
        @blur="finding = false"
      >
      <input
        v-else
        ref="findInput"
        v-model="find"
        class="mono h-7 flex-1 bg-transparent text-[12px] text-(--tx) outline-none placeholder:text-(--fa)"
        placeholder="find"
        @keydown="onFindKey"
        @blur="finding = false"
      >
      <span class="text-[11px] text-(--fa)">{{ mode === 'tail' ? '' : `${prefs.kl('awsLogNext')} next · ` }}Esc clears</span>
    </div>
    <div v-if="(mode === 'events' ? events.error.value : mode === 'results' ? results.error.value : '')" class="px-4 py-2 text-[12px] text-(--red)">
      {{ mode === 'events' ? events.error.value : results.error.value }}
    </div>
    <AwsLines
      ref="lines"
      :lines="mode === 'events' ? eventLines : mode === 'results' ? resultLines : tailLines"
      :json="json"
      :find="mode === 'tail' ? '' : find"
      :at="findAt"
      :follow="mode !== 'results'"
      :empty="(mode === 'events' && events.busy.value) || (mode === 'results' && results.busy.value) ? 'Reading…' : mode === 'tail' ? (tailState === 'starting' ? 'Starting the live tail…' : 'Waiting for events…') : 'No events.'"
    />
  </div>
</template>
