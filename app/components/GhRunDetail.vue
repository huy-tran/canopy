<script setup lang="ts">
// A workflow run: its jobs and their steps, a job's log (or the failed steps' logs), and re-run or cancel.
import type { GhRunDetail } from '#shared/types'

const props = defineProps<{ repo: string; id: number }>()

const G = useGithubStore()
const GW = useGhWorldStore()
const ui = useUiStore()

const run = ref<GhRunDetail | null>(null)
const error = ref('')
const loading = ref(false)
/** The job whose log is showing; 0 for the failed steps of the whole run. */
const job = ref<number | null>(null)
const log = ref<{ step: string; text: string }[] | null>(null)
const logError = ref('')
const acting = ref(false)

async function load() {
  loading.value = true
  const r = await api.gh.run(props.repo, props.id)
  loading.value = false
  error.value = r.ok ? '' : r.error || 'Could not read the run.'
  if (!r.run) return
  run.value = r.run
  if (job.value === null) {
    // Straight to what went wrong, if anything did.
    const failed = r.run.jobs.find(j => j.state === 'failure')
    showLog(failed ? failed.id : r.run.jobs[0]?.id ?? null)
  }
}

/** gh prints "job<tab>step<tab>time line"; keeps the step and the line, without the timestamp. */
function parseLog(txt: string) {
  return txt.split('\n').filter(Boolean).map((l) => {
    const [, step = '', rest = ''] = l.match(/^[^\t]*\t([^\t]*)\t(.*)$/) || [null, '', l]
    // A job's own log has no step names: gh says UNKNOWN STEP for every line.
    return { step: step === 'UNKNOWN STEP' ? '' : step, text: rest.replace(/^﻿/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\x1b\[[0-9;]*m/g, '') }
  })
}

async function showLog(id: number | null) {
  job.value = id
  log.value = null
  logError.value = ''
  if (id === null) return
  const j = run.value?.jobs.find(x => x.id === id)
  if (j && isLive(j)) {
    logError.value = 'The log shows once this job finishes.'
    return
  }
  const r = await api.gh.runLog(props.repo, props.id, id || undefined)
  if (job.value !== id) return
  if (!r.ok) logError.value = r.error || 'Could not read the log.'
  else log.value = parseLog(r.log || '')
}

async function act(what: 'rerun' | 'rerun-failed' | 'cancel') {
  if (acting.value) return
  acting.value = true
  const r = what === 'cancel' ? await api.gh.cancel(props.repo, props.id) : await api.gh.rerun(props.repo, props.id, what === 'rerun-failed')
  acting.value = false
  if (!r.ok) {
    ui.toast({ title: what === 'cancel' ? 'Could not cancel the run' : 'Could not re-run', body: r.error, error: true })
    return
  }
  ui.toast({ title: what === 'cancel' ? 'Cancelling the run' : what === 'rerun-failed' ? 'Re-running the failed jobs' : 'Re-running the workflow' })
  setTimeout(() => {
    load()
    GW.refreshRepos([props.repo])
  }, 2500)
}

const failedLog = computed(() => run.value?.jobs.some(j => j.state === 'failure'))
const dur = (a: number, b: number) => (a && b ? `${Math.max(1, Math.round((b - a) / 1000))}s` : '')
const openUrl = (u: string) => api.sys.openExternal(u)

// Follow it while it runs, unless Canopy is hidden or GitHub's allowance is running low.
const timer = setInterval(() => { if (run.value && isLive(run.value) && !document.hidden && !GW.slow) load() }, 10_000)
onBeforeUnmount(() => clearInterval(timer))
// Keys: up and down the jobs, each showing its log; re-run, re-run the failed jobs, or cancel.
function stepJob(d: number) {
  const jobs = run.value?.jobs || []
  const i = jobs.findIndex(j => j.id === job.value)
  const next = jobs[Math.min(jobs.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))]
  if (next) showLog(next.id)
}

useGhKeys(() => {
  const r = run.value
  const live = !!r && isLive(r)
  return {
    keys: {
      ghDown: { run: () => stepJob(1), hint: 'next job' },
      ghUp: { run: () => stepJob(-1) },
      ...(r && !live ? { ghRerun: { run: () => act('rerun'), hint: 're-run' } } : {}),
      ...(r && !live && failedLog.value ? { ghRerunFailed: { run: () => act('rerun-failed'), hint: 're-run failed' } } : {}),
      ...(live ? { ghCancel: { run: () => act('cancel'), hint: 'cancel' } } : {}),
      ghRunWorkflow: { run: () => { G.dispatch = props.repo }, hint: 'run workflow' },
      ghBrowser: { run: () => r && openUrl(r.url), hint: 'browser' },
      ghRefresh: { run: load },
    },
  }
})

onMounted(load)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex flex-none flex-col gap-1 border-b border-(--ln2) px-4 pb-2.5 pt-2">
      <div class="flex items-center gap-2">
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="G.back()" />
        <UIcon v-if="run" :name="RUN_ICON[run.state]" class="size-4 flex-none" :class="{ 'animate-spin': run.state === 'running' }" :style="{ color: RUN_DOT[run.state] }" />
        <span class="ellipsis min-w-0 flex-1 text-[14px] font-semibold">{{ run ? `${run.workflow} · ${run.title}` : 'Workflow run' }}</span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="loading" title="Refresh" @click="load" />
        <template v-if="run">
          <UButton v-if="isLive(run)" size="xs" color="error" variant="subtle" label="Cancel" :loading="acting" @click="act('cancel')" />
          <template v-else>
            <UButton v-if="failedLog" size="xs" color="neutral" variant="subtle" label="Re-run failed" :loading="acting" @click="act('rerun-failed')" />
            <UButton size="xs" color="neutral" variant="subtle" label="Re-run all" :loading="acting" @click="act('rerun')" />
          </template>
          <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-link-square-02" label="Open on GitHub" @click="openUrl(run.url)" />
        </template>
      </div>
      <div v-if="run" class="flex flex-wrap gap-x-2.5 pl-8 text-[11.5px] text-(--mu)">
        <span :style="{ color: RUN_DOT[run.state] }">{{ RUN_LABEL[run.state] }}</span>
        <span class="mono">{{ run.repo }}</span>
        <span>on <span class="mono text-(--tx2)">{{ run.branch }}</span></span>
        <span>{{ run.event }} · {{ ago(ui.now - run.createdAt) }} ago</span>
        <span v-if="run.attempt > 1">attempt {{ run.attempt }}</span>
      </div>
    </div>

    <div v-if="error && !run" class="p-4 text-[12px] text-(--red)">{{ error }}</div>
    <div v-else-if="!run" class="grid flex-1 place-items-center text-[12px] text-(--fa)">Reading the run…</div>

    <div v-else class="flex min-h-0 flex-1">
      <!-- Jobs and their steps -->
      <div class="w-[300px] flex-none overflow-auto border-r border-(--ln2) py-1">
        <div v-for="j in run.jobs" :key="j.id">
          <button
            class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-(--hov)"
            :class="job === j.id ? 'bg-(--hov) text-(--tx)' : 'text-(--tx2)'"
            @click="showLog(j.id)"
          >
            <UIcon :name="RUN_ICON[j.state]" class="size-4 flex-none" :class="{ 'animate-spin': j.state === 'running' }" :style="{ color: RUN_DOT[j.state] }" />
            <span class="ellipsis flex-1 font-medium">{{ j.name }}</span>
            <span class="mono flex-none text-[10.5px] text-(--fa)">{{ dur(j.startedAt, j.completedAt) }}</span>
          </button>
          <div v-if="job === j.id" class="pb-1">
            <div v-for="s in j.steps" :key="s.n" class="flex items-center gap-2 py-0.5 pl-9 pr-3 text-[11.5px] text-(--mu)">
              <span class="h-1.5 w-1.5 flex-none rounded-full" :style="{ background: RUN_DOT[s.state] }" />
              <span class="ellipsis" :class="s.state === 'failure' && 'text-(--red)'">{{ s.name }}</span>
            </div>
          </div>
        </div>
        <button
          v-if="failedLog"
          class="mt-1 flex w-full cursor-pointer items-center gap-2 border-t border-(--ln2) px-3 py-2 text-left text-[12px] text-(--red) hover:bg-(--hov)"
          :class="job === 0 && 'bg-(--hov)'"
          @click="showLog(0)"
        >
          <UIcon name="i-hugeicons-alert-02" class="size-4 flex-none" />Failed steps only
        </button>
      </div>

      <!-- The log -->
      <div class="mono min-h-0 min-w-0 flex-1 select-text overflow-auto bg-(--term) py-2 text-[11.5px] leading-[1.55]">
        <div v-if="logError" class="px-4 text-(--fa)">{{ logError }}</div>
        <div v-else-if="job === null" class="px-4 text-(--fa)">Pick a job to see its log.</div>
        <div v-else-if="!log" class="px-4 text-(--fa)">Reading the log…</div>
        <div v-else-if="!log.length" class="px-4 text-(--fa)">The log is empty.</div>
        <template v-for="(l, k) in log" :key="k">
          <div v-if="l.step && l.step !== log?.[k - 1]?.step" class="sticky top-0 bg-(--pbg) px-4 py-0.5 font-sans text-[11px] font-semibold text-(--mu)">{{ l.step }}</div>
          <div class="whitespace-pre-wrap px-4 text-(--ttx) [overflow-wrap:anywhere]" :class="/##\[error\]|\berror\b/i.test(l.text) && 'text-(--red)'">{{ l.text.replace(/^##\[(error|warning|group|endgroup)\]/, '') }}</div>
        </template>
      </div>
    </div>
  </div>
</template>
