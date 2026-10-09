<script setup lang="ts">
// A pull request: its description, reviews and comments, the diff file by file, its checks, and
// review (approve, request changes, comment) and merge (merge, squash or rebase) through gh.
import type { GhPullDetail } from '#shared/types'
import type { DiffLine } from '~/utils/diff'

const props = defineProps<{ url: string }>()

const G = useGithubStore()
const ui = useUiStore()

const pull = ref<GhPullDetail | null>(null)
const error = ref('')
const loading = ref(false)
const view = ref<'overview' | 'files' | 'checks'>('overview')

async function load() {
  loading.value = true
  const r = await api.gh.pull(props.url)
  loading.value = false
  error.value = r.ok ? '' : r.error || 'Could not read the pull request.'
  if (r.pull) pull.value = r.pull
}

// ---------- Files ----------

const diffs = shallowRef<Map<string, string> | null>(null)
const diffError = ref('')
const file = ref<string | null>(null)
// Shallow: a big diff is thousands of lines, each with highlighted segments.
const lines = shallowRef<DiffLine[]>([])

async function loadDiff() {
  if (diffs.value) return
  const r = await api.gh.pullDiff(props.url)
  if (!r.ok) {
    diffError.value = r.error || 'Could not read the diff.'
    return
  }
  diffs.value = splitDiff(r.diff || '')
  if (!file.value) file.value = pull.value?.files[0]?.path || [...diffs.value.keys()][0] || null
}

let token = 0
watch([file, diffs], async () => {
  const t = ++token
  const f = file.value
  const txt = f ? diffs.value?.get(f) : null
  const rows = txt ? parseDiff(txt) : []
  lines.value = rows
  if (f && rows.length && await highlightDiff(rows, f) && t === token) lines.value = [...rows]
})

watch(view, (v) => { if (v === 'files') loadDiff() })

// ---------- Review ----------

const composing = ref<'approve' | 'request-changes' | 'comment' | null>(null)
const body = ref('')
const sending = ref(false)
const REVIEW_VERB = { 'approve': 'Approve', 'request-changes': 'Request changes', 'comment': 'Comment' } as const

function compose(kind: 'approve' | 'request-changes' | 'comment') {
  composing.value = kind
  body.value = ''
}

async function sendReview() {
  const kind = composing.value
  if (!kind || sending.value) return
  if (kind !== 'approve' && !body.value.trim()) {
    ui.toast({ title: 'Write something first', body: kind === 'comment' ? 'A comment needs some text.' : 'Say what needs to change.', error: true })
    return
  }
  sending.value = true
  const r = await api.gh.review(props.url, kind, body.value)
  sending.value = false
  if (!r.ok) {
    ui.toast({ title: `Could not ${REVIEW_VERB[kind].toLowerCase()}`, body: r.error, error: true })
    return
  }
  ui.toast({ title: kind === 'approve' ? `Approved #${pull.value?.number}` : kind === 'comment' ? 'Comment posted' : `Asked for changes on #${pull.value?.number}` })
  composing.value = null
  focusGhWindow()
  G.changed()
  load()
}

function onComposeKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    sendReview()
  } else if (e.key === 'Escape') {
    // Esc drops the comment, rather than just leaving the box.
    e.preventDefault()
    e.stopPropagation()
    cancelCompose()
  }
}

function cancelCompose() {
  composing.value = null
  focusGhWindow()
}

// ---------- Merge ----------

const METHOD_LABEL = { squash: 'Squash and merge', merge: 'Merge commit', rebase: 'Rebase and merge' } as const
const methods = computed(() => {
  const m = pull.value?.merge
  return (['squash', 'merge', 'rebase'] as const).filter(k => m?.[k]).map(k => ({ label: METHOD_LABEL[k], value: k }))
})
const method = ref<'merge' | 'squash' | 'rebase'>('squash')
const deleteBranch = ref(false)
const merging = ref(false)

watch(pull, (p, was) => {
  if (!p || was) return
  if (!methods.value.some(m => m.value === method.value)) method.value = methods.value[0]?.value || 'merge'
  deleteBranch.value = p.merge.deleteBranch
})

/** Why it can't be merged from here, or a warning that GitHub may still refuse. */
const mergeNote = computed(() => {
  const p = pull.value
  if (!p) return null
  if (p.state === 'MERGED') return { block: true, text: 'Merged' }
  if (p.state === 'CLOSED') return { block: true, text: 'Closed' }
  if (!p.merge.allowed) return { block: true, text: 'You can\'t merge in this repo' }
  if (p.draft) return { block: true, text: 'Still a draft' }
  if (p.mergeable === 'CONFLICTING' || p.mergeState === 'DIRTY') return { block: true, text: 'Has conflicts with ' + p.base }
  if (p.mergeState === 'BLOCKED') return { block: false, text: 'Blocked until required reviews or checks pass' }
  if (p.mergeState === 'BEHIND') return { block: false, text: `Behind ${p.base}` }
  if (p.mergeState === 'UNSTABLE') return { block: false, text: 'Some checks failed' }
  return null
})

function askMerge() {
  const p = pull.value
  if (!p || merging.value) return
  ui.confirm = {
    title: `${METHOD_LABEL[method.value]} #${p.number}?`,
    body: `Merges "${p.title}" into ${p.base} in ${p.repo}.${deleteBranch.value ? ` Deletes ${p.head} on GitHub.` : ''}`,
    ok: METHOD_LABEL[method.value],
    run: doMerge,
  }
}

async function doMerge() {
  const p = pull.value
  if (!p) return
  merging.value = true
  focusGhWindow()
  const r = await api.gh.merge(props.url, method.value, deleteBranch.value)
  merging.value = false
  if (!r.ok) {
    ui.toast({ title: `Could not merge #${p.number}`, body: r.error, error: true })
    return
  }
  ui.toast({ title: `Merged #${p.number} into ${p.base}` })
  G.changed()
  load()
}

// ---------- Overview ----------

const REVIEWER = {
  APPROVED: { label: 'Approved', color: 'var(--grn)' },
  CHANGES_REQUESTED: { label: 'Changes requested', color: 'var(--red)' },
  COMMENTED: { label: 'Commented', color: 'var(--mu)' },
  DISMISSED: { label: 'Dismissed', color: 'var(--fa)' },
  PENDING: { label: 'Pending', color: 'var(--fa)' },
  REQUESTED: { label: 'Review requested', color: 'var(--amb)' },
} as const
const CHECK = { pass: { icon: 'i-hugeicons-checkmark-circle-02', color: 'var(--grn)' }, fail: { icon: 'i-hugeicons-cancel-circle', color: 'var(--red)' }, pending: { icon: 'i-hugeicons-loading-03', color: 'var(--amb)' }, skipped: { icon: 'i-hugeicons-remove-circle', color: 'var(--fa)' } } as const

const checkSummary = computed(() => {
  const c = pull.value?.checks || []
  const n = (s: string) => c.filter(x => x.state === s).length
  return { fail: n('fail'), pending: n('pending'), pass: n('pass'), total: c.length }
})

const decision = computed(() => {
  const d = pull.value?.reviewDecision
  return d === 'APPROVED' ? { text: 'Approved', color: 'var(--grn)' } : d === 'CHANGES_REQUESTED' ? { text: 'Changes requested', color: 'var(--red)' } : d === 'REVIEW_REQUIRED' ? { text: 'Review required', color: 'var(--amb)' } : null
})

const STATE = { OPEN: { text: 'Open', color: 'var(--grn)' }, MERGED: { text: 'Merged', color: 'var(--vio)' }, CLOSED: { text: 'Closed', color: 'var(--red)' } } as const

const openUrl = (u: string) => api.sys.openExternal(u)

// ---------- Keys ----------

/** A merge by key: picks the method, then asks, as the button does. */
function mergeBy(m: 'merge' | 'squash' | 'rebase') {
  const p = pull.value
  if (!p || p.state !== 'OPEN') return
  if (mergeNote.value?.block) return ui.toast({ title: `Can't merge #${p.number}`, body: mergeNote.value.text, error: true })
  if (!methods.value.some(x => x.value === m)) return ui.toast({ title: `${METHOD_LABEL[m]} isn't allowed in ${p.repo}`, error: true })
  method.value = m
  askMerge()
}

function reviewBy(kind: 'approve' | 'request-changes' | 'comment') {
  const p = pull.value
  if (!p || p.state !== 'OPEN') return
  if (kind !== 'comment' && p.mine) return ui.toast({ title: 'That\'s your own pull request', body: 'GitHub doesn\'t let you approve or request changes on it.', error: true })
  compose(kind)
}

const VIEWS = ['overview', 'files', 'checks'] as const
function stepView(d: number) {
  view.value = VIEWS[(VIEWS.indexOf(view.value) + d + VIEWS.length) % VIEWS.length]!
}

function stepFile(d: number) {
  const files = pull.value?.files || []
  const i = files.findIndex(f => f.path === file.value)
  const next = files[Math.min(files.length - 1, Math.max(0, i + d))]
  if (next) file.value = next.path
}

useGhKeys(() => ({
  keys: composing.value ? {} : {
    ghApprove: { run: () => reviewBy('approve'), hint: 'approve' },
    ghRequestChanges: { run: () => reviewBy('request-changes'), hint: 'request changes' },
    ghComment: { run: () => reviewBy('comment'), hint: 'comment' },
    ghSquash: { run: () => mergeBy('squash'), hint: 'squash' },
    ghMergeCommit: { run: () => mergeBy('merge'), hint: 'merge' },
    ghRebase: { run: () => mergeBy('rebase'), hint: 'rebase' },
    ghDeleteBranch: { run: () => { deleteBranch.value = !deleteBranch.value }, hint: deleteBranch.value ? 'keep branch' : 'delete branch' },
    ghBrowser: { run: () => openUrl(props.url), hint: 'browser' },
    ghRefresh: { run: load },
    ghNextTab: { run: () => stepView(1), hint: 'overview, files, checks' },
    ghPrevTab: { run: () => stepView(-1) },
    ...(view.value === 'files' ? { ghDown: { run: () => stepFile(1), hint: 'next file' }, ghUp: { run: () => stepFile(-1) } } : {}),
  },
}))

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- Title -->
    <div class="flex flex-none flex-col gap-1 border-b border-(--ln2) px-4 pb-2.5 pt-2">
      <div class="flex items-center gap-2">
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="G.back()" />
        <span class="ellipsis min-w-0 flex-1 text-[14px] font-semibold">{{ pull?.title || 'Pull request' }}</span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="loading" title="Refresh" @click="load" />
        <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-link-square-02" label="Open on GitHub" @click="openUrl(url)" />
      </div>
      <div v-if="pull" class="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-8 text-[11.5px] text-(--mu)">
        <span class="rounded-sm px-1.5 font-semibold" :style="{ color: STATE[pull.state].color, background: `color-mix(in oklch, ${STATE[pull.state].color} 14%, transparent)` }">{{ pull.draft ? 'Draft' : STATE[pull.state].text }}</span>
        <span class="mono">{{ pull.repo }} #{{ pull.number }}</span>
        <span>{{ pull.author }} wants to merge <span class="mono text-(--tx2)">{{ pull.head }}</span> into <span class="mono text-(--tx2)">{{ pull.base }}</span></span>
        <span class="mono"><span class="text-(--grn)">+{{ pull.additions }}</span> <span class="text-(--red)">−{{ pull.deletions }}</span></span>
        <span v-if="decision" :style="{ color: decision.color }">{{ decision.text }}</span>
        <span v-if="checkSummary.total" :style="{ color: checkSummary.fail ? 'var(--red)' : checkSummary.pending ? 'var(--amb)' : 'var(--grn)' }">
          {{ checkSummary.fail ? `${checkSummary.fail} checks failing` : checkSummary.pending ? `${checkSummary.pending} checks running` : 'Checks pass' }}
        </span>
      </div>
    </div>

    <div v-if="error && !pull" class="p-4 text-[12px] text-(--red)">{{ error }}</div>
    <div v-else-if="!pull" class="grid flex-1 place-items-center text-[12px] text-(--fa)">Reading the pull request…</div>

    <template v-else>
      <div class="flex h-10 flex-none items-center border-b border-(--ln2) px-4">
        <Seg
          v-model="view"
          size="sm"
          :items="[
            { label: 'Overview', value: 'overview' },
            { label: `Files · ${pull.files.length}`, value: 'files' },
            { label: `Checks · ${pull.checks.length}`, value: 'checks' },
          ]"
        />
      </div>

      <!-- Overview: description, reviewers, comments -->
      <div v-if="view === 'overview'" class="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div class="max-w-[860px]">
          <!-- eslint-disable-next-line vue/no-v-html -- escaped by markdown() -->
          <div v-if="pull.body" class="gh-md select-text" @click="onMarkdownClick" v-html="markdown(pull.body)" />
          <div v-else class="text-[12px] italic text-(--fa)">No description.</div>

          <div class="mt-5 text-[12px] font-semibold">Reviewers</div>
          <div v-if="!pull.reviewers.length" class="mt-1 text-[12px] text-(--fa)">Nobody yet.</div>
          <div v-for="r in pull.reviewers" :key="r.login" class="mt-1.5 flex items-center gap-2 text-[12px]">
            <span class="h-2 w-2 rounded-full" :style="{ background: REVIEWER[r.state].color }" />
            <span class="text-(--tx)">{{ r.login }}</span>
            <span :style="{ color: REVIEWER[r.state].color }">{{ REVIEWER[r.state].label }}</span>
          </div>

          <template v-if="pull.comments.length">
            <div class="mt-5 text-[12px] font-semibold">Comments</div>
            <div v-for="(c, i) in pull.comments" :key="i" class="mt-2 rounded-md border border-(--ln2) px-3 py-2">
              <div class="text-[11.5px] text-(--mu)"><span class="font-medium text-(--tx2)">{{ c.author }}</span> · {{ ago(ui.now - c.at) }} ago</div>
              <!-- eslint-disable-next-line vue/no-v-html -- escaped by markdown() -->
              <div class="gh-md mt-1 select-text" @click="onMarkdownClick" v-html="markdown(c.body)" />
            </div>
          </template>
        </div>
      </div>

      <!-- Files: the changed files, and the selected one's diff -->
      <div v-else-if="view === 'files'" class="flex min-h-0 flex-1">
        <div class="w-[260px] flex-none overflow-auto border-r border-(--ln2) py-1">
          <button
            v-for="f in pull.files"
            :key="f.path"
            class="flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-[12px] hover:bg-(--hov)"
            :class="file === f.path ? 'bg-(--hov) text-(--tx)' : 'text-(--tx2)'"
            :title="f.path"
            @click="file = f.path"
          >
            <span class="ellipsis min-w-0 flex-1">{{ f.path.split('/').pop() }}<span v-if="f.path.includes('/')" class="text-(--fa)"> · {{ f.path.split('/').slice(0, -1).join('/') }}</span></span>
            <span class="mono flex-none text-[10.5px]"><span class="text-(--grn)">+{{ f.additions }}</span> <span class="text-(--red)">−{{ f.deletions }}</span></span>
          </button>
        </div>
        <div class="mono min-h-0 min-w-0 flex-1 select-text overflow-auto bg-(--term) py-2 text-[12px] leading-[1.6]">
          <div v-if="diffError" class="px-4 text-(--red)">{{ diffError }}</div>
          <div v-else-if="!diffs" class="px-4 text-(--fa)">Reading the diff…</div>
          <div v-else-if="!lines.length" class="px-4 text-(--fa)">No text changes in this file.</div>
          <div v-for="(ln, k) in lines" :key="k" class="flex min-w-max whitespace-pre" :style="{ background: ln.bg }">
            <span class="w-11 flex-none select-none pr-2.5 text-right text-(--fa)">{{ ln.n }}</span>
            <span class="w-4 flex-none select-none" :style="{ color: ln.sc }">{{ ln.sign }}</span>
            <span class="pr-4" :style="{ color: ln.tc }"><span v-for="(g, j) in ln.segs" :key="j" :style="{ color: g.color, fontStyle: g.fs }">{{ g.t }}</span></span>
          </div>
        </div>
      </div>

      <!-- Checks -->
      <div v-else class="min-h-0 flex-1 overflow-auto">
        <div v-if="!pull.checks.length" class="p-4 text-[12px] text-(--fa)">No checks on the latest commit.</div>
        <button
          v-for="(c, i) in pull.checks"
          :key="i"
          class="flex w-full cursor-pointer items-center gap-2.5 border-b border-(--ln2) px-4 py-2 text-left text-[12.5px] hover:bg-(--hov)"
          :disabled="!c.url"
          @click="c.url && openUrl(c.url)"
        >
          <UIcon :name="CHECK[c.state].icon" class="size-4 flex-none" :class="{ 'animate-spin': c.state === 'pending' }" :style="{ color: CHECK[c.state].color }" />
          <span class="ellipsis flex-1 text-(--tx)">{{ c.name }}</span>
          <UIcon v-if="c.url" name="i-hugeicons-link-square-02" class="size-3.5 flex-none text-(--fa)" />
        </button>
      </div>

      <!-- Review composer -->
      <div v-if="composing" class="flex flex-none flex-col gap-2 border-t border-(--ln) bg-(--chrome) px-4 py-3">
        <span class="text-[12px] font-medium">{{ REVIEW_VERB[composing] }}<span class="font-normal text-(--fa)"> · {{ composing === 'approve' ? 'a comment is optional' : 'say what you think' }} · Ctrl Enter to send</span></span>
        <UTextarea
          v-model="body"
          :rows="3"
          autoresize
          :maxrows="10"
          autofocus
          variant="none"
          :placeholder="composing === 'approve' ? 'Looks good to me' : composing === 'comment' ? 'Leave a comment' : 'What needs to change'"
          :ui="{ base: 'w-full rounded-md border border-(--ln) bg-(--inp) px-2.5 py-1.5 text-[12px] leading-[1.5] text-(--tx) placeholder:text-(--fa)' }"
          @keydown="onComposeKey"
        />
        <div class="flex justify-end gap-2">
          <UButton size="sm" color="neutral" variant="ghost" label="Cancel" @click="cancelCompose" />
          <UButton size="sm" :color="composing === 'request-changes' ? 'error' : 'primary'" :loading="sending" :label="REVIEW_VERB[composing]" @click="sendReview" />
        </div>
      </div>

      <!-- Actions: review on the left, merge on the right, with why merging may not work above them -->
      <div v-else-if="pull.state === 'OPEN'" class="flex flex-none flex-col gap-1.5 border-t border-(--ln) bg-(--chrome) px-4 py-2.5">
        <div v-if="mergeNote" class="flex items-center gap-1.5 text-[11.5px]" :class="mergeNote.block ? 'text-(--red)' : 'text-(--amb)'">
          <UIcon name="i-hugeicons-alert-02" class="size-3.5" />{{ mergeNote.text }}
        </div>
        <div class="flex items-center gap-2">
          <UTooltip :text="pull.mine ? 'GitHub doesn\'t let you approve your own pull request' : 'Approve, with an optional comment'">
            <UButton size="sm" color="primary" icon="i-hugeicons-checkmark-circle-02" label="Approve" :disabled="pull.mine" @click="compose('approve')" />
          </UTooltip>
          <UButton size="sm" color="neutral" variant="subtle" label="Request changes" :disabled="pull.mine" @click="compose('request-changes')" />
          <UButton size="sm" color="neutral" variant="subtle" icon="i-hugeicons-comment-01" label="Comment" @click="compose('comment')" />
          <div class="flex-1" />
          <template v-if="!mergeNote?.block">
            <label class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px] text-(--tx2)">
              <input v-model="deleteBranch" type="checkbox" class="accent-(--grn)">Delete branch
            </label>
            <Seg v-if="methods.length > 1" v-model="method" size="sm" :items="methods.map(m => ({ label: m.value === 'merge' ? 'Merge' : m.value === 'squash' ? 'Squash' : 'Rebase', value: m.value, title: m.label }))" />
            <UButton size="sm" color="success" icon="i-hugeicons-git-merge" :loading="merging" :label="METHOD_LABEL[method]" @click="askMerge" />
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
/* Rendered Markdown in PR descriptions and comments. */
.gh-md { font-size: 12.5px; line-height: 1.6; color: var(--tx2); overflow-wrap: anywhere; }
.gh-md > :first-child { margin-top: 0; }
.gh-md p, .gh-md ul, .gh-md ol, .gh-md pre, .gh-md blockquote { margin: 0 0 8px; }
.gh-md h3, .gh-md h4, .gh-md h5, .gh-md h6 { margin: 14px 0 6px; color: var(--tx); font-weight: 600; }
.gh-md h3 { font-size: 14px; }
.gh-md h4 { font-size: 13px; }
.gh-md h5, .gh-md h6 { font-size: 12.5px; }
.gh-md ul { padding-left: 18px; list-style: disc; }
.gh-md ol { padding-left: 20px; list-style: decimal; }
.gh-md li { margin: 2px 0; }
.gh-md li input { margin-right: 4px; vertical-align: -1px; }
.gh-md strong { color: var(--tx); font-weight: 600; }
.gh-md code { font-family: var(--mono); font-size: 11.5px; padding: 1px 4px; border-radius: 4px; background: var(--chip); color: var(--tx); }
.gh-md pre { padding: 8px 10px; border-radius: 6px; background: var(--term); overflow-x: auto; }
.gh-md pre code { padding: 0; background: none; }
.gh-md blockquote { padding-left: 10px; border-left: 3px solid var(--ln); color: var(--mu); }
.gh-md a { color: var(--lnk); cursor: pointer; }
.gh-md a:hover { text-decoration: underline; }
.gh-md hr { border: 0; border-top: 1px solid var(--ln2); margin: 12px 0; }
</style>
