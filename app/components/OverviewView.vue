<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { HistorySession, Session } from '#shared/types'
import { k } from '~/utils/format'

const P = useProjectsStore()
const S = useSessionsStore()
const ui = useUiStore()
const { history } = useOverviewHistory()

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ALPHAS = [1, 0.5, 0.28, 0.18]
const H = 150

// Live durations and day boundaries.
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 5000) })
onBeforeUnmount(() => { if (tick) clearInterval(tick) })

const hoverBar = ref<number | null>(null)

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtD = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`
/** Local midnight `ag` days before `ts`. */
const dayAgo = (ts: number, ag: number) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ag) }
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

/** One row of spend: a history log, a live session, or both merged by claudeId. */
interface Entry {
  key: string
  repoId: string
  live: Session | null
  h: HistorySession | null
  start: number
  cost: number
  tok: number
  days: Record<string, number>
}

const project = computed(() => P.current)
const repos = computed(() => project.value?.repos ?? [])
const col = (i: number) => pcol(project.value?.hue ?? 0, ALPHAS[i] ?? 0.15)

const entries = computed<Entry[]>(() => {
  const p = project.value
  if (!p) return []
  const ids = new Set(p.repos.map(r => r.id))
  const live = S.claudeOf(p.id)
  const byClaude = new Map(history.value.filter(h => h.claudeId).map(h => [h.claudeId, h]))
  const today = dayKey(new Date(now.value))
  const used = new Set<string>()
  const out: Entry[] = []
  for (const s of live) {
    if (!ids.has(s.repoId)) continue
    const h = (s.claudeId && byClaude.get(s.claudeId)) || null
    if (h) used.add(h.claudeId)
    const days = { ...(h?.days ?? {}) }
    const lc = S.cost(s), hc = sum(days)
    // Live counters may be ahead of the log; book the difference on today.
    if (lc > hc) days[today] = (days[today] || 0) + (lc - hc)
    const lt = s.tokIn + s.tokOut + s.cacheR + s.cacheW
    const ht = h ? h.tokIn + h.tokOut + h.cacheR + h.cacheW : 0
    out.push({ key: 'l' + s.id, repoId: s.repoId, live: s, h, start: Math.min(s.started, h?.start ?? s.started), cost: Math.max(lc, hc), tok: Math.max(lt, ht), days })
  }
  for (const h of history.value) {
    if (used.has(h.claudeId) || !ids.has(h.repoId)) continue
    out.push({ key: 'h' + h.claudeId, repoId: h.repoId, live: null, h, start: h.start, cost: h.cost, tok: h.tokIn + h.tokOut + h.cacheR + h.cacheW, days: h.days || {} })
  }
  return out
})

/** Spend per repo over a set of day keys (null = all time). Tokens are split by each session's cost share. */
function per(keys: Set<string> | null) {
  const R = repos.value
  const costs = R.map(() => 0), toks = R.map(() => 0), sess = R.map(() => 0)
  for (const e of entries.value) {
    const i = R.findIndex(r => r.id === e.repoId)
    if (i < 0) continue
    const c = keys ? Object.entries(e.days).reduce((a, [d, v]) => a + (keys.has(d) ? v : 0), 0) : Math.max(e.cost, sum(e.days))
    if (c <= 0 && !e.live) continue
    costs[i]! += c
    toks[i]! += e.cost > 0 ? e.tok * Math.min(1, c / e.cost) : e.tok
    sess[i]!++
  }
  const total = costs.reduce((a, b) => a + b, 0)
  return { costs, toks, sess, total, tok: toks.reduce((a, b) => a + b, 0), n: sess.reduce((a, b) => a + b, 0) }
}

const lastDays = (n: number) => new Set(Array.from({ length: n }, (_, ag) => dayKey(dayAgo(now.value, ag))))

const week = computed(() => per(lastDays(7)))

const periods = computed(() => {
  const R = repos.value, n = Math.max(1, R.length)
  const first = entries.value.reduce((a, e) => Math.min(a, e.start), Infinity)
  const since = !Number.isFinite(first) || dayKey(new Date(first)) === dayKey(new Date(now.value)) ? 'today' : MON[new Date(first).getMonth()]
  const mk = (label: string, x: ReturnType<typeof per>, sub: string) => ({
    label,
    sub,
    cost: usd(x.total),
    tokens: k(x.tok),
    segs: R.map((r, i) => ({ id: r.id, w: x.total ? (x.costs[i]! / x.total * 100).toFixed(1) + '%' : (100 / n) + '%', bg: col(i) })),
    legend: R.map((r, i) => ({ id: r.id, label: r.label, cost: usd(x.costs[i]!), bg: col(i) })),
  })
  const t = per(lastDays(1)), w = week.value, a = per(null)
  return [
    mk('Today', t, `${t.n} sessions`),
    mk('This week', w, `${w.n} sessions`),
    mk('All time', a, `${a.n} sessions · since ${since}`),
  ]
})

const chart = computed(() => {
  const R = repos.value, days = ui.range
  const D = Array.from({ length: days }, (_, i) => {
    const ag = days - 1 - i, date = dayAgo(now.value, ag), key = dayKey(date)
    const vals = R.map(() => 0)
    for (const e of entries.value) {
      const j = R.findIndex(r => r.id === e.repoId)
      if (j >= 0) vals[j]! += e.days[key] || 0
    }
    return { date, vals, total: vals.reduce((a, b) => a + b, 0), ag }
  })
  const yMax = Math.max(4, Math.ceil(Math.max(...D.map(d => d.total)) / 4) * 4)
  const hbI = hoverBar.value != null && D[hoverBar.value] ? hoverBar.value : D.length - 1, hb = D[hbI]!
  const bars = D.map((d, i) => ({
    op: i === hbI ? 1 : 0.72,
    segs: d.vals.map((v, j) => ({ h: (v > 0 ? Math.max(1, Math.round(v / yMax * H)) : 0) + 'px', bg: col(j) })),
  }))
  const readout = `${hb.ag === 0 ? 'Today' : DN[hb.date.getDay()] + ' ' + fmtD(hb.date)} · ${usd(hb.total)}`
    + (R.length > 1 ? '  ·  ' + R.map((r, j) => `${r.label} ${usd(hb.vals[j]!)}`).join('  ') : '')
  const ticks = [0, 1, 2, 3, 4].map(q => { const i = Math.round(q * (days - 1) / 4); return i === days - 1 ? 'Today' : fmtD(D[i]!.date) })
  return { bars, readout, ticks, yl: ['$' + yMax, '$' + yMax / 2, '$0'], barGap: days > 40 ? '1px' : '4px' }
})

function hover(i: number) {
  if (hoverBar.value !== i) hoverBar.value = i
}
const RANGES = [14, 30, 90].map(d => ({ label: d + 'd', value: d }))
const range = computed({
  get: () => ui.range,
  set: (d: number) => { ui.range = d; hoverBar.value = null },
})

const repoBreak = computed(() => {
  const w = week.value
  return repos.value.map((r, i) => ({
    id: r.id,
    label: r.label,
    path: r.path,
    cost: usd(w.costs[i]!),
    pct: w.total ? (w.costs[i]! / w.total * 100).toFixed(0) + '%' : '0%',
    bg: col(i),
    sessions: w.sess[i]!,
    tokens: k(w.toks[i]!),
  }))
})

interface Row {
  id: string
  sid: string | null
  repoId: string
  dot: string
  stLabel: string
  repo: string
  title: string
  branch: string
  start: string
  dur: string
  tin: string
  tout: string
  cache: string
  cost: string
}

function startLabel(ts: number) {
  const d = new Date(ts), n = now.value
  if (dayKey(d) === dayKey(new Date(n))) return 'Today ' + clock(ts)
  // Weekday within the last week, date beyond that so older rows stay unambiguous.
  return (d.getTime() >= dayAgo(n, 6).getTime() ? DN[d.getDay()] : fmtD(d)) + ' ' + clock(ts)
}

const repoFilter = computed({
  get: () => repos.value.some(r => r.id === ui.repoFilter) ? ui.repoFilter : 'all',
  set: (id: string) => { ui.repoFilter = id },
})

const rows = computed<Row[]>(() => {
  const R = repos.value, label = (id: string) => R.find(r => r.id === id)?.label ?? ''
  const live = entries.value.filter(e => e.live).sort((a, b) => b.live!.started - a.live!.started)
  const past = entries.value.filter(e => !e.live).sort((a, b) => b.start - a.start)
  const out: Row[] = []
  for (const e of live) {
    const s = e.live!
    out.push({
      id: e.key, sid: s.id, repoId: s.repoId, dot: SC[s.status] || SC.idle!, stLabel: SL[s.status] || '', repo: label(s.repoId),
      title: s.title, branch: s.branch, start: startLabel(s.started), dur: dur(now.value - s.started),
      tin: k(s.tokIn), tout: k(s.tokOut), cache: `${k(s.cacheR)} / ${k(s.cacheW)}`, cost: usd(S.cost(s)),
    })
  }
  for (const e of past) {
    const h = e.h!
    out.push({
      id: e.key, sid: null, repoId: h.repoId, dot: SC.done!, stLabel: 'Ended', repo: label(h.repoId),
      title: h.title, branch: h.branch, start: startLabel(h.start), dur: dur(Math.max(0, h.end - h.start)),
      tin: k(h.tokIn), tout: k(h.tokOut), cache: `${k(h.cacheR)} / ${k(h.cacheW)}`, cost: usd(h.cost),
    })
  }
  const rf = repoFilter.value
  return out.filter(r => rf === 'all' || r.repoId === rf).slice(0, 50)
})

const filters = computed(() => [{ value: 'all', label: 'All' }, ...repos.value.map(r => ({ value: r.id, label: r.label }))])

// Grid in the prototype: 84 54 1fr 160 92 70 66 60 116 62, 12px gaps, 16px side padding.
const W = [84, 54, 0, 160, 92, 70, 66, 60, 116, 62]
const RIGHT = new Set([5, 6, 7, 8, 9])
const MONO: Record<number, string> = { 3: 'var(--mu)', 4: 'var(--mu)', 5: 'var(--tx3)', 6: 'var(--tx3)', 7: 'var(--tx3)', 8: 'var(--fa)' }
const cellStyle = (i: number) => {
  const pl = i === 0 ? 16 : 12, pr = i === W.length - 1 ? 16 : 0
  const w = W[i] ? `width:${W[i]! + pl + pr}px;` : ''
  return `${w}padding:0 ${pr}px 0 ${pl}px;${RIGHT.has(i) ? 'text-align:right;' : ''}`
}
const KEYS = ['status', 'repo', 'title', 'branch', 'start', 'dur', 'tin', 'tout', 'cache', 'cost'] as const
const HEADS = ['Status', 'Repo', 'Session', 'Branch', 'Started', 'Duration', 'In', 'Out', 'Cache r / w', 'Cost']
const columns: TableColumn<Row>[] = KEYS.map((key, i) => ({
  id: key,
  accessorKey: key === 'status' ? 'stLabel' : key,
  header: HEADS[i],
  meta: {
    style: {
      th: cellStyle(i),
      td: cellStyle(i) + (MONO[i] ? `font-family:var(--mono);font-size:11px;color:${MONO[i]};` : ''),
    },
  },
}))

const tableMeta = {
  class: { tr: (row: { original: Row }) => row.original.sid ? 'cursor-pointer' : 'cursor-default' },
}

function onSelect(_e: Event, row: { original: Row }) {
  if (row.original.sid) ui.focusSession(row.original.sid)
}

const totalLabel = computed(() => `${entries.value.length} total · showing recent`)
const cols = computed(() => ui.width >= 1180 ? 'minmax(0,2fr) minmax(260px,1fr)' : 'minmax(0,1fr)')</script>

<template>
  <div v-if="project" style="flex:1;min-height:0;overflow:auto;">
    <div style="display:flex;flex-direction:column;gap:14px;padding:20px 24px 28px;max-width:1280px;">
      <div style="font-size:11.5px;color:var(--fa);">
        Costs are API-equivalent estimates from Claude Code's token counts, so they show relative spend on a subscription plan.
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
        <div
          v-for="pd in periods"
          :key="pd.label"
          style="display:flex;flex-direction:column;gap:10px;padding:14px 16px;background:var(--chrome);border:1px solid var(--ln);border-radius:var(--radius-lg);"
        >
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--mu);">
            <span>{{ pd.label }}</span><span class="ellipsis">{{ pd.sub }}</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;">
            <span class="mono" style="font-size:26px;font-weight:500;letter-spacing:-0.02em;">{{ pd.cost }}</span>
            <span class="mono" style="font-size:12px;color:var(--tx3);">{{ pd.tokens }} tokens</span>
          </div>
          <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;gap:2px;">
            <div v-for="sg in pd.segs" :key="sg.id" :style="{ width: sg.w, background: sg.bg }" />
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--mu);">
            <span v-for="lg in pd.legend" :key="lg.id" style="display:flex;align-items:center;gap:5px;">
              <span :style="{ width: '8px', height: '8px', borderRadius: '2px', background: lg.bg }" />{{ lg.label }} {{ lg.cost }}
            </span>
          </div>
        </div>
      </div>

      <div :style="{ display: 'grid', gridTemplateColumns: cols, gap: '12px' }">
        <div
          style="min-width:0;display:flex;flex-direction:column;gap:14px;padding:14px 16px;background:var(--chrome);border:1px solid var(--ln);border-radius:var(--radius-lg);"
          @mouseleave="hoverBar = null"
        >
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-size:12.5px;font-weight:600;">Cost per day</span>
            <span class="mono" style="font-size:11px;color:var(--tx3);white-space:pre;">{{ chart.readout }}</span>
            <div style="flex:1;" />
            <Seg v-model="range" :items="RANGES" size="sm" mono />
          </div>
          <div style="display:flex;gap:8px;">
            <div class="mono" style="display:flex;flex-direction:column;justify-content:space-between;height:150px;font-size:10px;color:var(--fa);text-align:right;width:28px;flex:none;">
              <span v-for="y in chart.yl" :key="y">{{ y }}</span>
            </div>
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
              <div
                :style="{ gap: chart.barGap }"
                style="height:150px;display:flex;align-items:flex-end;border-bottom:1px solid var(--ln);background:linear-gradient(var(--ln2),var(--ln2)) 0 0/100% 1px no-repeat,linear-gradient(var(--ln2),var(--ln2)) 0 75px/100% 1px no-repeat;"
              >
                <div
                  v-for="(b, i) in chart.bars"
                  :key="i"
                  :style="{ opacity: b.op }"
                  style="flex:1;min-width:0;height:100%;display:flex;flex-direction:column-reverse;gap:1px;cursor:crosshair;"
                  @mouseenter="hover(i)"
                >
                  <div v-for="(sg, j) in b.segs" :key="j" :style="{ height: sg.h, background: sg.bg }" style="flex:none;" />
                </div>
              </div>
              <div class="mono" style="display:flex;justify-content:space-between;font-size:10px;color:var(--fa);">
                <span v-for="(t, i) in chart.ticks" :key="i">{{ t }}</span>
              </div>
            </div>
          </div>
        </div>

        <div style="min-width:0;display:flex;flex-direction:column;gap:4px;padding:14px 16px;background:var(--chrome);border:1px solid var(--ln);border-radius:var(--radius-lg);">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="font-size:12.5px;font-weight:600;">By repo</span><span style="font-size:11.5px;color:var(--mu);">This week</span>
          </div>
          <div v-for="rb in repoBreak" :key="rb.id" style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-top:1px solid var(--ln2);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="mono" style="font-size:10.5px;color:var(--tx2);background:var(--chip);padding:1px 5px;border-radius:var(--radius-sm);">{{ rb.label }}</span>
              <span class="mono ellipsis" style="font-size:11px;color:var(--mu);flex:1;">{{ rb.path }}</span>
              <span class="mono" style="font-size:14px;">{{ rb.cost }}</span>
            </div>
            <div style="height:4px;border-radius:2px;background:var(--trk);overflow:hidden;">
              <div :style="{ width: rb.pct, height: '100%', background: rb.bg }" />
            </div>
            <div style="display:flex;gap:14px;font-size:11.5px;color:var(--mu);">
              <span>{{ rb.sessions }} sessions</span><span>{{ rb.tokens }} tokens</span><span>{{ rb.pct }} of week</span>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;background:var(--chrome);border:1px solid var(--ln);border-radius:var(--radius-lg);overflow:hidden;">
        <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;flex-wrap:wrap;">
          <span style="font-size:12.5px;font-weight:600;">Sessions</span>
          <span style="font-size:11.5px;color:var(--mu);">{{ totalLabel }}</span>
          <div style="flex:1;" />
          <Seg v-model="repoFilter" :items="filters" size="sm" />
        </div>
        <UTable
          :data="rows"
          :columns="columns"
          :meta="tableMeta"
          :get-row-id="(r: Row) => r.id"
          :on-select="onSelect"
          :ui="{
            root: 'overflow-x-auto',
            base: 'w-full min-w-[960px] table-fixed border-collapse',
            thead: '',
            tbody: 'divide-y-0 [&>tr]:data-[selectable=true]:hover:bg-(--hov)',
            separator: 'hidden',
            tr: '',
            th: 'h-auto py-[7px] text-[11px] font-normal text-(--fa) border-y border-(--ln2) whitespace-nowrap',
            td: 'h-[32px] py-0 text-[12px] text-(--tx3) border-b border-(--ln2) whitespace-nowrap overflow-hidden',
            empty: 'px-4 py-5 text-left text-[12px] text-(--fa)',
          }"
        >
          <template #status-cell="{ row }">
            <span style="display:flex;align-items:center;gap:6px;color:var(--tx3);">
              <span :style="{ width: '6px', height: '6px', borderRadius: '50%', background: row.original.dot, flex: 'none' }" />{{ row.original.stLabel }}
            </span>
          </template>
          <template #repo-cell="{ row }">
            <span class="mono" style="font-size:10.5px;color:var(--tx2);background:var(--chip);padding:1px 5px;border-radius:var(--radius-sm);">{{ row.original.repo }}</span>
          </template>
          <template #title-cell="{ row }">
            <div class="ellipsis" :style="{ color: row.original.sid ? 'var(--tx)' : 'var(--tx2)' }">{{ row.original.title }}</div>
          </template>
          <template #branch-cell="{ row }">
            <div class="ellipsis">{{ row.original.branch }}</div>
          </template>
          <template #cost-cell="{ row }">
            <span class="mono" style="font-size:11.5px;color:var(--tx);">{{ row.original.cost }}</span>
          </template>
          <template #empty>
            No sessions yet.
          </template>
        </UTable>
      </div>
    </div>
  </div>
</template>
