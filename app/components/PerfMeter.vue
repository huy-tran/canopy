<script setup lang="ts">
// Canopy's own memory, CPU and frame rate in the status bar; click for the details.
import type { MetricsSample } from '~/stores/metrics'

const M = useMetricsStore()
const ui = useUiStore()
const open = ref(false)

onMounted(() => M.use())
onBeforeUnmount(() => M.release())

/** Green when fine, amber when high, red when it hurts. */
function level(v: number, warn: number, bad: number, lowIsBad = false) {
  const x = lowIsBad ? -v : v, w = lowIsBad ? -warn : warn, b = lowIsBad ? -bad : bad
  return x >= b ? 'var(--red)' : x >= w ? 'var(--ambf)' : ''
}

const mb = (v: number) => (v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${Math.round(v)} MB`)
/** The frame rate that matters: the 3D World's while it runs, else the window's. */
const fps = computed(() => (ui.sim && M.sceneFps ? M.sceneFps : M.fps))

const chips = computed(() => {
  const a = M.app
  return [
    { key: 'mem', label: a ? mb(a.memMB) : '-', color: a ? level(a.memMB, 1500, 3000) : '' },
    { key: 'cpu', label: a ? `${Math.round(a.cpu)}%` : '-', color: a ? level(a.cpu, 25, 60) : '' },
    // The 3D World idles at 30 fps on purpose, so it only warns well below that.
    { key: 'fps', label: fps.value ? `${fps.value} fps` : '-', color: !fps.value ? '' : ui.sim && M.sceneFps ? level(fps.value, 20, 12, true) : level(fps.value, 50, 30, true) },
  ]
})

const W = 132, H = 26

function spark(pick: (s: MetricsSample) => number, floor = 0) {
  const h = M.history
  if (h.length < 2) return ''
  const vs = h.map(pick)
  const max = Math.max(floor, ...vs), min = Math.min(0, ...vs)
  const span = max - min || 1
  return vs.map((v, i) => `${((i / (vs.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - min) / span) * (H - 4)).toFixed(1)}`).join(' ')
}

const graphs = computed(() => {
  const a = M.app
  return [
    { key: 'mem', label: 'Memory', value: a ? mb(a.memMB) : '-', sub: 'all Canopy processes', pts: spark(s => s.memMB, 256), color: 'var(--lnk)' },
    { key: 'cpu', label: 'CPU', value: a ? `${a.cpu.toFixed(1)}%` : '-', sub: 'of the whole machine', pts: spark(s => s.cpu, 10), color: 'var(--grn)' },
    { key: 'fps', label: 'Frame rate', value: fps.value ? `${fps.value} fps` : '-', sub: ui.sim && M.sceneFps ? '3D World' : 'window', pts: spark(s => s.fps, 60), color: 'var(--ambf)' },
    { key: 'lag', label: 'Main process', value: a ? `${a.busy.toFixed(1)}% busy` : '-', sub: a ? `late by ${a.lagMs.toFixed(1)} ms · worst ${Math.round(a.lagMaxMs)} ms` : '', pts: spark(s => s.lagMs, 5), color: 'var(--red)' },
  ]
})

/** Processes grouped by kind, biggest first. */
const procs = computed(() => {
  const m = new Map<string, { type: string; n: number; memMB: number; cpu: number }>()
  for (const p of M.app?.procs || []) {
    const x = m.get(p.type) || { type: p.type, n: 0, memMB: 0, cpu: 0 }
    x.n++
    x.memMB += p.memMB
    x.cpu += p.cpu
    m.set(p.type, x)
  }
  return [...m.values()].sort((a, b) => b.memMB - a.memMB)
})

const facts = computed(() => {
  const a = M.app
  return [
    { label: 'Terminals', value: a ? String(a.ptys) : '-' },
    { label: 'Terminal output', value: a ? `${a.ptyKBps.toFixed(1)} KB/s` : '-' },
    { label: 'Messages to the window', value: a ? `${Math.round(a.ipcPerSec)}/s` : '-' },
    { label: 'Window JS heap', value: M.heapMB ? mb(M.heapMB) : '-' },
    { label: 'Freezes over 50 ms', value: M.longTasks ? `${M.longTasks} · longest ${M.longestMs} ms` : 'none' },
  ]
})
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'top', align: 'start', sideOffset: 6 }"
    :ui="{ content: 'w-[340px] max-w-[calc(100vw-20px)] bg-(--modal) ring-0 border border-(--bb) rounded-lg shadow-(--shadow) p-3 flex flex-col gap-3 text-(--tx)' }"
  >
    <UTooltip text="Canopy's memory, CPU and frame rate · click for details" :disabled="open">
      <button type="button" class="flex cursor-pointer items-center gap-2 rounded-sm px-1 hover:text-(--tx)">
        <UIcon name="i-hugeicons-activity-01" class="size-3 text-(--tx3)" />
        <span v-for="c in chips" :key="c.key" class="mono text-[10.5px]" :style="{ color: c.color || undefined }">{{ c.label }}</span>
      </button>
    </UTooltip>

    <template #content>
      <div class="flex items-center">
        <span class="flex-1 text-[13px] font-semibold">Canopy performance</span>
        <span class="text-[11px] text-(--fa)">last 2 minutes</span>
      </div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div v-for="g in graphs" :key="g.key" class="flex min-w-0 flex-col gap-0.5">
          <div class="flex items-baseline gap-1.5">
            <span class="text-[11px] text-(--mu)">{{ g.label }}</span>
            <span class="mono ml-auto text-[11.5px]">{{ g.value }}</span>
          </div>
          <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="h-[26px] w-full rounded-sm bg-(--trk)">
            <polyline v-if="g.pts" :points="g.pts" fill="none" :stroke="g.color" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" />
          </svg>
          <span class="text-[10.5px] text-(--fa)">{{ g.sub }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1 border-t border-(--ln2) pt-2.5">
        <span class="label-caps pb-0.5">Processes</span>
        <div v-for="p in procs" :key="p.type" class="flex items-center gap-2 text-[11.5px]">
          <span class="text-(--tx2)">{{ p.type }}<span v-if="p.n > 1" class="text-(--fa)"> ×{{ p.n }}</span></span>
          <span class="mono ml-auto text-(--mu)">{{ p.cpu.toFixed(1) }}%</span>
          <span class="mono w-[64px] text-right">{{ mb(p.memMB) }}</span>
        </div>
      </div>
      <div class="flex flex-col gap-1 border-t border-(--ln2) pt-2.5">
        <div v-for="f in facts" :key="f.label" class="flex items-center gap-2 text-[11.5px]">
          <span class="text-(--tx2)">{{ f.label }}</span>
          <span class="mono ml-auto">{{ f.value }}</span>
        </div>
      </div>
      <span class="text-[10.5px] leading-snug text-(--fa)">Claude Code itself runs in separate processes and isn't counted here. Process CPU is per core.</span>
    </template>
  </UPopover>
</template>
