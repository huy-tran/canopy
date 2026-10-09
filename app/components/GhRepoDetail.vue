<script setup lang="ts">
// A repo: its open pull requests, its workflow runs from the last week and its Dependabot alerts,
// each opening into the same screens as the rest of the GitHub view.
import type { GhAlert, GhPull, GhRun } from '#shared/types'

const props = defineProps<{ name: string }>()

const G = useGithubStore()
const ui = useUiStore()
const prefs = usePrefsStore()

const info = computed(() => G.repoList?.find(r => r.name === props.name) || null)
const pulls = ref<GhPull[] | null>(null)
const runs = ref<GhRun[] | null>(null)
const alerts = ref<GhAlert[] | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  await Promise.all([
    api.gh.search(`repo:${props.name}`).then((r) => { pulls.value = r.pulls }),
    api.gh.runs([props.name]).then((r) => { runs.value = r }),
    api.gh.alerts([props.name]).then((r) => { alerts.value = r }),
  ])
  loading.value = false
}

const RUNS_SHOWN = 10
const ALERTS_SHOWN = 10
const counts = computed(() => {
  const c = { critical: 0, high: 0, moderate: 0, low: 0 }
  for (const a of alerts.value || []) c[a.severity]++
  return c
})

const url = computed(() => info.value?.url || `https://github.com/${props.name}`)
const openUrl = (u: string) => api.sys.openExternal(u)

function copyClone() {
  const cmd = `gh repo clone ${props.name}`
  navigator.clipboard.writeText(cmd).then(() => ui.toast({ title: 'Copied', body: cmd })).catch(() => {})
}

// ---------- Keys: one list down through the PRs, then the runs, then the alerts ----------

type Entry = { kind: 'pr'; p: GhPull } | { kind: 'run'; r: GhRun } | { kind: 'alert'; a: GhAlert }
const entries = computed<Entry[]>(() => [
  ...(pulls.value || []).map(p => ({ kind: 'pr' as const, p })),
  ...(runs.value || []).slice(0, RUNS_SHOWN).map(r => ({ kind: 'run' as const, r })),
  ...(alerts.value || []).slice(0, ALERTS_SHOWN).map(a => ({ kind: 'alert' as const, a })),
])
const runAt = computed(() => pulls.value?.length || 0)
const alertAt = computed(() => runAt.value + Math.min(RUNS_SHOWN, runs.value?.length || 0))

function openEntry(e: Entry) {
  if (e.kind === 'pr') G.openPull(e.p.url)
  else if (e.kind === 'run') G.openRun(e.r.repo, e.r.id)
  else openUrl(e.a.url)
}

const { sel } = useGhList(() => entries.value, openEntry, () => ({
  ghRunWorkflow: { run: () => { G.dispatch = props.name }, hint: 'run workflow' },
  ghBrowser: {
    run: () => {
      const e = entries.value[sel.value]
      openUrl(!e ? url.value : e.kind === 'pr' ? e.p.url : e.kind === 'run' ? e.r.url : e.a.url)
    },
    hint: 'browser',
  },
  ghRefresh: { run: load },
}))

const selClass = (i: number) => (i === sel.value ? 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]' : '')

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex flex-none flex-col gap-1 border-b border-(--ln2) px-4 pb-2.5 pt-2">
      <div class="flex items-center gap-2">
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="G.back()" />
        <UIcon name="i-hugeicons-book-02" class="size-4 flex-none text-(--mu)" />
        <span class="ellipsis min-w-0 flex-1 text-[14px]"><span class="text-(--mu)">{{ name.split('/')[0] }}/</span><span class="font-semibold">{{ repoShort(name) }}</span></span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="loading" title="Refresh" @click="load" />
        <UButton size="xs" color="primary" variant="subtle" icon="i-hugeicons-play" :label="`Run workflow (${prefs.kl('ghRunWorkflow')})`" @click="G.dispatch = name" />
        <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-copy-01" label="Copy clone command" @click="copyClone" />
        <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-link-square-02" label="Open on GitHub" @click="openUrl(url)" />
      </div>
      <div v-if="info" class="flex flex-wrap items-center gap-x-2.5 pl-8 text-[11.5px] text-(--mu)">
        <span>{{ info.private ? 'Private' : 'Public' }}{{ info.archived ? ' · archived' : '' }}</span>
        <span v-if="info.language">{{ info.language }}</span>
        <span>default branch <span class="mono text-(--tx2)">{{ info.defaultBranch }}</span></span>
        <span>updated {{ ago(ui.now - info.pushedAt) }} ago</span>
      </div>
      <div v-if="info?.description" class="pl-8 text-[12px] text-(--tx2)">{{ info.description }}</div>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <!-- Open pull requests -->
      <div class="flex h-9 items-center gap-2 border-b border-(--ln2) bg-(--chrome) px-4 text-[12px] font-semibold">
        <UIcon name="i-hugeicons-git-pull-request" class="size-4 text-(--mu)" />Open pull requests
        <span class="font-normal text-(--fa)">{{ pulls?.length ?? '' }}</span>
      </div>
      <div v-if="!pulls" class="px-4 py-3 text-[12px] text-(--fa)">Reading…</div>
      <div v-else-if="!pulls.length" class="px-4 py-3 text-[12px] text-(--fa)">No open pull requests.</div>
      <button
        v-for="(p, i) in pulls"
        :key="p.url"
        class="flex w-full cursor-pointer items-center gap-3 border-b border-(--ln2) px-4 py-2 text-left hover:bg-(--hov)"
        :class="selClass(i)"
        :data-gh-sel="i === sel"
        @click="G.openPull(p.url)"
      >
        <span class="h-2 w-2 flex-none rounded-full" :style="{ background: REVIEW_DOT[p.review] }" :title="REVIEW_LABEL[p.review]" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="ellipsis text-[12.5px] text-(--tx)">{{ p.title }}</span>
          <span class="ellipsis text-[11px] text-(--mu)"><span class="mono">#{{ p.number }}</span> · {{ p.author }} · {{ REVIEW_LABEL[p.review] }} · opened {{ ago(ui.now - p.createdAt) }} ago</span>
        </div>
        <span v-if="p.checks" class="flex flex-none items-center gap-1 text-[11px]" :style="{ color: CHECKS_DOT[p.checks] }">
          <span class="h-1.5 w-1.5 rounded-full" :style="{ background: CHECKS_DOT[p.checks] }" />{{ CHECKS_LABEL[p.checks] }}
        </span>
      </button>

      <!-- Workflow runs -->
      <div class="flex h-9 items-center gap-2 border-b border-(--ln2) bg-(--chrome) px-4 text-[12px] font-semibold">
        <UIcon name="i-hugeicons-workflow-square-10" class="size-4 text-(--mu)" />Workflow runs
        <span class="font-normal text-(--fa)">last 7 days</span>
      </div>
      <div v-if="!runs" class="px-4 py-3 text-[12px] text-(--fa)">Reading…</div>
      <div v-else-if="!runs.length" class="px-4 py-3 text-[12px] text-(--fa)">No runs this week.</div>
      <button
        v-for="(r, i) in (runs || []).slice(0, RUNS_SHOWN)"
        :key="r.id"
        class="flex w-full cursor-pointer items-center gap-3 border-b border-(--ln2) px-4 py-2 text-left hover:bg-(--hov)"
        :class="selClass(runAt + i)"
        :data-gh-sel="runAt + i === sel"
        @click="G.openRun(r.repo, r.id)"
      >
        <UIcon :name="RUN_ICON[r.state]" class="size-4 flex-none" :class="{ 'animate-spin': r.state === 'running' }" :style="{ color: RUN_DOT[r.state] }" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="ellipsis text-[12.5px] text-(--tx)"><span class="font-medium">{{ r.workflow }}</span><span v-if="r.title && r.title !== r.workflow" class="text-(--mu)"> · {{ r.title }}</span></span>
          <span class="ellipsis text-[11px] text-(--mu)"><span class="mono">{{ r.branch }}</span> · {{ r.event.replace(/_/g, ' ') }} · {{ ago(ui.now - r.startedAt) }} ago</span>
        </div>
        <span class="flex-none text-[11px]" :style="{ color: RUN_DOT[r.state] }">{{ RUN_LABEL[r.state] }}</span>
      </button>
      <div v-if="runs && runs.length > RUNS_SHOWN" class="px-4 py-2 text-[11.5px] text-(--fa)">and {{ runs.length - RUNS_SHOWN }} more this week</div>

      <!-- Dependabot alerts -->
      <div class="flex h-9 items-center gap-2 border-b border-(--ln2) bg-(--chrome) px-4 text-[12px] font-semibold">
        <UIcon name="i-hugeicons-shield-01" class="size-4 text-(--mu)" />Dependabot alerts
        <template v-if="alerts?.length">
          <span v-for="s in (['critical', 'high', 'moderate', 'low'] as const)" :key="s" class="font-normal" :style="{ color: counts[s] ? SEV_DOT[s] : 'var(--fa)' }">{{ counts[s] }} {{ SEV_LABEL[s].toLowerCase() }}</span>
        </template>
      </div>
      <div v-if="!alerts" class="px-4 py-3 text-[12px] text-(--fa)">Reading…</div>
      <div v-else-if="!alerts.length" class="px-4 py-3 text-[12px] text-(--fa)">No open alerts, or none you can see.</div>
      <button
        v-for="(a, i) in (alerts || []).slice(0, ALERTS_SHOWN)"
        :key="a.number"
        class="flex w-full cursor-pointer items-center gap-3 border-b border-(--ln2) px-4 py-2 text-left hover:bg-(--hov)"
        :class="selClass(alertAt + i)"
        :data-gh-sel="alertAt + i === sel"
        @click="openUrl(a.url)"
      >
        <span class="w-[62px] flex-none rounded-sm py-px text-center text-[10.5px] font-semibold" :style="{ color: SEV_DOT[a.severity], background: `color-mix(in oklch, ${SEV_DOT[a.severity]} 15%, transparent)` }">{{ SEV_LABEL[a.severity] }}</span>
        <span class="ellipsis min-w-0 flex-1 text-[12.5px] text-(--tx)"><span class="mono font-medium">{{ a.pkg }}</span><span class="text-(--mu)"> · {{ a.summary }}</span></span>
        <span class="flex-none text-[11px]" :class="a.fixed ? 'text-(--grn)' : 'text-(--fa)'">{{ a.fixed ? `fixed in ${a.fixed}` : 'no fix yet' }}</span>
      </button>
      <button v-if="alerts && alerts.length > ALERTS_SHOWN" class="w-full cursor-pointer px-4 py-2 text-left text-[11.5px] text-(--lnk) hover:underline" @click="openUrl(`${url}/security/dependabot`)">
        See all {{ alerts.length }} on GitHub
      </button>
    </div>
  </div>
</template>
