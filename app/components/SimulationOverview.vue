<script setup lang="ts">
// A project's overview at a glance, shown over its room's big screen in the workspace simulation.
import type { HistorySession } from '#shared/types'
import { castFor } from '~/simulation/cast'

const props = defineProps<{ pid: string }>()

const P = useProjectsStore()
const S = useSessionsStore()
const ui = useUiStore()

/** History logs per project, read at most every half minute while hovering. */
const cache = useState<Record<string, { at: number; list: HistorySession[] }>>('sim-history', () => ({}))

const project = computed(() => P.byId(props.pid))

watch(() => props.pid, async (pid) => {
  const p = P.byId(pid)
  const hit = cache.value[pid]
  if (!p || !p.repos.length || (hit && Date.now() - hit.at < 30_000)) return
  try {
    const list = await api.history(p.repos.map(r => ({ id: r.id, path: r.path })))
    cache.value = { ...cache.value, [pid]: { at: Date.now(), list } }
  } catch {
    // Logs may be mid-write; the live numbers still show.
  }
}, { immediate: true })

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayAgo = (ag: number) => { const d = new Date(ui.now); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ag)) }

/** Spend per day: the logs, with live sessions topping up today where they run ahead of them. */
const days = computed(() => {
  const out: Record<string, number> = {}
  const list = cache.value[props.pid]?.list || []
  const byClaude = new Map(list.map(h => [h.claudeId, h]))
  for (const h of list) for (const [d, v] of Object.entries(h.days || {})) out[d] = (out[d] || 0) + v
  const today = dayAgo(0)
  for (const s of S.claudeOf(props.pid)) {
    const h = s.claudeId ? byClaude.get(s.claudeId) : null
    const logged = h ? Object.values(h.days || {}).reduce((a, b) => a + b, 0) : 0
    const extra = S.cost(s) - logged
    if (extra > 0) out[today] = (out[today] || 0) + extra
  }
  return out
})

const within = (n: number) => Array.from({ length: n }, (_, i) => days.value[dayAgo(i)] || 0).reduce((a, b) => a + b, 0)
const totals = computed(() => [
  { label: 'Today', v: within(1) },
  { label: 'This week', v: within(7) },
  { label: 'All time', v: Object.values(days.value).reduce((a, b) => a + b, 0) },
])

const bars = computed(() => {
  const vals = Array.from({ length: 14 }, (_, i) => days.value[dayAgo(13 - i)] || 0)
  const max = Math.max(...vals, 0.01)
  return vals.map(v => Math.max(v ? 6 : 2, (v / max) * 100))
})

const live = computed(() => {
  const ss = S.claudeOf(props.pid).filter(s => !s.exited)
  return ss.map(s => ({ s, who: castFor(s.id)?.name || '', subs: S.subagents[s.id]?.length || 0 }))
})
const pastCount = computed(() => (cache.value[props.pid]?.list || []).length)
</script>

<template>
  <div v-if="project" class="w-[300px] overflow-hidden rounded-xl border border-(--ln) bg-(--win) text-(--tx) shadow-2xl">
    <div class="h-1" :style="{ background: pcol(project.hue) }" />
    <div class="flex items-center gap-2 px-3.5 pb-2 pt-3">
      <span class="h-2.5 w-2.5 flex-none rounded-[3px]" :style="{ background: pcol(project.hue) }" />
      <span class="ellipsis flex-1 text-[13px] font-semibold">{{ project.name }}</span>
      <span class="text-[11px] text-(--fa)">{{ project.repos.length }} repo{{ project.repos.length === 1 ? '' : 's' }}</span>
    </div>

    <div class="grid grid-cols-3 gap-1.5 px-3.5">
      <div v-for="t in totals" :key="t.label" class="rounded-lg bg-(--hov) px-2 py-1.5">
        <div class="text-[10.5px] text-(--fa)">{{ t.label }}</div>
        <div class="mono text-[13px] font-semibold">{{ usd(t.v) }}</div>
      </div>
    </div>

    <div class="flex h-9 items-end gap-[3px] px-3.5 pt-2">
      <div v-for="(h, i) in bars" :key="i" class="flex-1 rounded-t-[2px]" :style="{ height: h + '%', background: pcol(project.hue, i === bars.length - 1 ? 1 : 0.55) }" />
    </div>
    <div class="flex justify-between px-3.5 pt-0.5 text-[10px] text-(--fa)"><span>14 days ago</span><span>today</span></div>

    <div class="mt-2 border-t border-(--ln) px-3.5 py-2.5">
      <div class="label-caps mb-1.5">In the room</div>
      <div v-if="!live.length" class="text-[11.5px] text-(--mu)">Nobody here. The lights are off.</div>
      <div v-for="x in live.slice(0, 5)" :key="x.s.id" class="flex items-center gap-2 py-[3px] text-[11.5px]">
        <span class="h-2 w-2 flex-none rounded-full" :style="{ background: SC[x.s.status] }" />
        <span class="flex-none font-medium">{{ x.who }}</span>
        <span class="ellipsis flex-1 text-(--mu)">{{ x.s.title }}</span>
        <span v-if="x.subs" class="flex-none text-[10.5px] text-(--fa)">+{{ x.subs }}</span>
        <span class="mono flex-none text-[10.5px] text-(--fa)">{{ usd(S.cost(x.s)) }}</span>
      </div>
      <div v-if="live.length > 5" class="pt-0.5 text-[11px] text-(--fa)">and {{ live.length - 5 }} more</div>
    </div>
    <div class="border-t border-(--ln) px-3.5 py-2 text-[10.5px] text-(--fa)">
      {{ pastCount }} past session{{ pastCount === 1 ? '' : 's' }} · click the room to fly in
    </div>
  </div>
</template>
