<script setup lang="ts">
// Workflow runs from the last week across the user's repos, running ones first, filterable by repo and outcome.
const G = useGithubStore()
const ui = useUiStore()

const repo = ref('all')
const only = ref<'all' | 'live' | 'failed'>('all')
/** Scheduled runs (nightly jobs, sweeps every few minutes) would bury the CI and deploy runs, so they're hidden unless asked for. */
const scheduled = ref(false)

const repos = computed(() => [...new Set((G.runs || []).map(r => r.repo))].sort())
const hiddenScheduled = computed(() => (scheduled.value ? 0 : (G.runs || []).filter(r => r.event === 'schedule').length))
const shown = computed(() => (G.runs || []).filter(r =>
  (repo.value === 'all' || r.repo === repo.value)
  && (scheduled.value || r.event !== 'schedule')
  && (only.value === 'all' || (only.value === 'live' ? isLive(r) : r.state === 'failure'))))

// Runs in progress move along: while the list is open, re-read just the repos with one going.
const GW = useGhWorldStore()
const timer = setInterval(() => GW.readLive(), 30_000)
onBeforeUnmount(() => clearInterval(timer))

const { sel } = useGhList(() => shown.value, r => G.openRun(r.repo, r.id), () => ({
  ghBrowser: { run: () => { const r = shown.value[sel.value]; if (r) api.sys.openExternal(r.url) }, hint: 'browser' },
  ghRefresh: { run: () => G.load('runs', true), hint: 'refresh' },
}))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <span class="text-[13px] font-semibold">Workflow runs</span>
      <span class="text-[12px] text-(--fa)">last 7 days</span>
      <div class="flex-1" />
      <label class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px] text-(--tx2)" :title="hiddenScheduled ? `${hiddenScheduled} scheduled runs hidden` : ''">
        <input v-model="scheduled" type="checkbox" class="accent-(--grn)">Scheduled
      </label>
      <Seg v-model="only" size="sm" :items="[{ label: 'All', value: 'all' }, { label: 'Running', value: 'live' }, { label: 'Failed', value: 'failed' }]" />
      <select v-model="repo" class="h-[26px] max-w-[220px] rounded-md border border-(--ln) bg-(--inp) px-2 text-[12px] text-(--tx)">
        <option value="all">All repos</option>
        <option v-for="r in repos" :key="r" :value="r">{{ r }}</option>
      </select>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="GW.loading" title="Refresh" @click="G.load('runs', true)" />
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div v-if="!G.runs" class="grid h-32 place-items-center text-[12px] text-(--fa)">Reading GitHub…</div>
      <div v-else-if="!shown.length" class="grid h-32 place-items-center text-[12px] text-(--fa)">No runs here.</div>
      <button
        v-for="(r, i) in shown"
        :key="r.id"
        class="flex w-full cursor-pointer items-center gap-3 border-b border-(--ln2) px-4 py-2.5 text-left hover:bg-(--hov)"
        :class="i === sel && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
        :data-gh-sel="i === sel"
        @click="G.openRun(r.repo, r.id)"
      >
        <UIcon :name="RUN_ICON[r.state]" class="size-4 flex-none" :class="{ 'animate-spin': r.state === 'running' }" :style="{ color: RUN_DOT[r.state] }" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="ellipsis text-[13px] text-(--tx)"><span class="font-medium">{{ r.workflow }}</span><span v-if="r.title && r.title !== r.workflow" class="text-(--mu)"> · {{ r.title }}</span></span>
          <span class="ellipsis text-[11.5px] text-(--mu)"><span class="mono">{{ repoShort(r.repo) }}</span> · <span class="mono">{{ r.branch }}</span> · {{ r.event.replace(/_/g, ' ') }} · {{ ago(ui.now - r.startedAt) }} ago</span>
        </div>
        <span class="flex-none text-[11.5px]" :style="{ color: RUN_DOT[r.state] }">{{ RUN_LABEL[r.state] }}</span>
      </button>
    </div>
  </div>
</template>
