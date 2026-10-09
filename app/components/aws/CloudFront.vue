<script setup lang="ts">
// CloudFront: distributions, a distribution's invalidations (followed every 5 seconds while one is
// in progress), and creating one. Flushing the whole cache (/*) needs INVALIDATE typed out.
import type { CfDistribution, CfInvalidation } from '#shared/aws'

const A = useAwsStore()

const list = useAwsLoad((ctx, force: boolean) => api.aws.cfDistributions(ctx, force))
const hist = useAwsLoad((ctx, dist: string, force: boolean) => api.aws.cfInvalidations(ctx, dist, force))
const mode = ref<'list' | 'history' | 'invalidate'>('list')
const dist = ref<CfDistribution | null>(null)
const paths = ref('/*')
const box = ref<HTMLTextAreaElement | null>(null)

const t = useAwsTable<CfDistribution>({
  rows: () => list.data.value || [],
  columns: () => [
    { key: 'id', label: 'ID', value: d => d.id, mono: true },
    { key: 'domain', label: 'Domain', value: d => d.domain, text: d => (d.aliases[0] ? `${d.aliases[0]} · ${d.domain}` : d.domain), flex: true },
    { key: 'origin', label: 'Origin', value: d => d.origin, mono: true },
    { key: 'status', label: 'Status', value: d => d.status, color: d => cfStatusColor(d.status) },
  ],
  filter: (d, q) => matches(q, d.id, d.domain, d.origin, ...d.aliases),
  active: () => mode.value === 'list',
  open: d => showHistory(d),
  openHint: 'invalidations',
  keys: d => ({
    awsRefresh: { run: () => list.load(true) },
    ...(d ? {
      awsCfInvalidate: { run: () => askPaths(d), hint: 'invalidate' },
      awsCfHistory: { run: () => showHistory(d) },
      awsBookmark: { run: () => A.toggleBookmark('CloudFront', d.id, `${d.domain} (${d.id})`) },
      awsRelated: { run: () => A.related(cfLinks(d)), hint: 'related' },
      awsCopy: { run: () => A.choose('Copy', [
        { key: 'i', label: 'id', run: () => copyText(d.id) },
        { key: 'd', label: 'domain', run: () => copyText(d.domain) },
        { key: 'o', label: 'origin', run: () => copyText(d.origin) },
      ]) },
    } : {}),
  }),
})

function showHistory(d: CfDistribution) {
  dist.value = d
  mode.value = 'history'
  hist.load(d.id, false)
}

const ht = useAwsTable<CfInvalidation>({
  rows: () => hist.data.value || [],
  columns: () => [
    { key: 'id', label: 'ID', value: i => i.id, mono: true, flex: true },
    { key: 'status', label: 'Status', value: i => i.status, color: i => cfStatusColor(i.status) },
    { key: 'created', label: 'Created', value: i => i.createdAt, text: i => awsTime(i.createdAt), sort: 'time' },
  ],
  filter: (i, q) => matches(q, i.id, i.status),
  active: () => mode.value === 'history',
  back: () => { mode.value = 'list' },
  sort: { key: 'created', desc: true },
  keys: () => ({
    awsRefresh: { run: () => dist.value && hist.load(dist.value.id, true) },
    ...(dist.value ? { awsCfInvalidate: { run: () => askPaths(dist.value!), hint: 'invalidate' } } : {}),
  }),
})

// Follow invalidations in progress, as aws-tui does.
const timer = setInterval(() => {
  if (mode.value === 'history' && dist.value && !document.hidden && (hist.data.value || []).some(i => i.status === 'InProgress')) hist.load(dist.value.id, true)
}, 5000)
onBeforeUnmount(() => clearInterval(timer))

function askPaths(d: CfDistribution) {
  dist.value = d
  mode.value = 'invalidate'
  nextTick(() => box.value?.focus())
}

/** One path per line; each starts with a slash. */
const pathList = computed(() => paths.value.split('\n').map(p => p.trim()).filter(Boolean).map(p => (p.startsWith('/') ? p : `/${p}`)))

function submit() {
  const d = dist.value
  const list = pathList.value
  if (!d || !list.length) return
  const all = list.includes('/*')
  A.confirm({
    title: all ? 'Flush the whole cache?' : `Invalidate ${list.length} path${list.length > 1 ? 's' : ''}?`,
    body: `${d.id} · ${d.aliases[0] || d.domain}${all ? '\nEvery cached object is fetched from the origin again.' : ''}`,
    lines: list,
    typed: all ? 'INVALIDATE' : undefined,
    ok: 'Invalidate',
    run: async () => {
      const r = await api.aws.cfInvalidate(A.c(), d.id, list)
      if (A.done(r, `Invalidation created on ${d.id}`, r.result || '')) showHistory(d)
    },
  })
}

/** Ctrl+S or Alt+Enter sends the paths; Esc goes back. */
function onBoxKey(e: KeyboardEvent) {
  if ((e.ctrlKey && e.code === 'KeyS') || (e.altKey && e.key === 'Enter')) {
    e.preventDefault()
    submit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    mode.value = 'list'
    focusAwsWindow()
  }
}

useAwsKeys(() => (mode.value === 'invalidate' ? { keys: { awsBack: { run: () => { mode.value = 'list' } } } } : { keys: {} }))

useAwsJump('CloudFront', (q) => {
  mode.value = 'list'
  t.query.value = q
})

onMounted(() => list.load(false))
</script>

<template>
  <AwsGrid
    v-if="mode === 'list'"
    :t="t"
    title="CloudFront distributions"
    :busy="list.busy.value"
    :error="list.error.value"
    :at="list.at.value"
    :waiting="!list.data.value"
    :row-key="d => d.id"
    :dim="d => !d.enabled"
    empty="No distributions."
    @open="showHistory"
    @refresh="list.load(true)"
  />

  <AwsGrid
    v-else-if="mode === 'history' && dist"
    :t="ht"
    :title="`Invalidations · ${dist.aliases[0] || dist.domain}`"
    :sub="(hist.data.value || []).some(i => i.status === 'InProgress') ? 'following every 5s while one is in progress' : ''"
    :busy="hist.busy.value"
    :error="hist.error.value"
    :at="hist.at.value"
    :waiting="!hist.data.value"
    :row-key="i => i.id"
    empty="No invalidations yet."
    @refresh="hist.load(dist.id, true)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'list'" />
    </template>
    <template #actions>
      <UButton size="xs" color="primary" variant="subtle" label="Invalidate…" @click="askPaths(dist)" />
    </template>
  </AwsGrid>

  <div v-else-if="mode === 'invalidate' && dist" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'list'" />
      <span class="text-[13px] font-semibold">Invalidate</span>
      <span class="mono text-[12px] text-(--mu)">{{ dist.id }} · {{ dist.aliases[0] || dist.domain }}</span>
    </div>
    <div class="flex max-w-[720px] flex-col gap-2 px-5 py-4">
      <span class="text-[12px] text-(--mu)">One path per line, such as /index.html or /assets/*</span>
      <textarea
        ref="box"
        v-model="paths"
        rows="8"
        class="mono rounded-md border border-(--ln) bg-(--inp) px-3 py-2 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)"
        @keydown="onBoxKey"
      />
      <div class="flex items-center gap-2">
        <span class="text-[11.5px] text-(--fa)">Ctrl+S or Alt+Enter to invalidate · Esc to go back</span>
        <div class="flex-1" />
        <UButton size="sm" color="primary" label="Invalidate…" :disabled="!pathList.length" @click="submit" />
      </div>
    </div>
  </div>
</template>
