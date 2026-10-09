import { defineStore } from 'pinia'
import type { HistorySession } from '#shared/types'

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Today's API-equivalent cost per project: logged sessions plus live ones. */
export const useCostsStore = defineStore('costs', () => {
  const P = useProjectsStore()
  const S = useSessionsStore()
  const history = shallowRef<Record<string, HistorySession[]>>({})

  async function refresh() {
    const ps = P.projects
    const lists = await Promise.all(ps.map(p => api.history(p.repos.map(r => ({ id: r.id, path: r.path }))).catch(() => [] as HistorySession[])))
    history.value = Object.fromEntries(ps.map((p, i) => [p.id, lists[i]!]))
  }

  function today(pid: string): number {
    const key = todayKey()
    const hist = history.value[pid] || []
    const byId = new Map(hist.map(h => [h.claudeId, h]))
    const live = S.claudeOf(pid)
    const liveIds = new Set(live.map(s => s.claudeId).filter(Boolean))
    const logged = hist.filter(h => !liveIds.has(h.claudeId)).reduce((a, h) => a + (h.days[key] || 0), 0)
    // A live session (possibly resumed from an earlier day) counts what the log has for today,
    // plus whatever it has spent since the log was last read.
    const liveToday = live.reduce((a, s) => {
      const h = byId.get(s.claudeId)
      const c = S.cost(s)
      return a + (h ? (h.days[key] || 0) + Math.max(0, c - h.cost) : c)
    }, 0)
    return logged + liveToday
  }

  const total = computed(() => P.projects.reduce((a, p) => a + today(p.id), 0))

  let timer: ReturnType<typeof setInterval> | undefined
  function start() {
    if (timer) return
    refresh()
    // Live sessions are counted as they go; the logs only add finished ones, so nothing is lost while hidden.
    timer = setInterval(() => { if (!document.hidden) refresh() }, 60_000)
  }

  return { history, refresh, today, total, start }
})
