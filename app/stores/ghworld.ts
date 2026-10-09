import { defineStore } from 'pinia'
import type { GhPull, GhRateLimit, GhRun, GhWorld } from '#shared/types'

/** A full read of repos, PRs and runs; while a run is going, its repo's runs are read again more often. */
const FULL_MS = 3 * 60_000
const LIVE_MS = 40_000
/** When GitHub's allowance runs low: full reads this far apart, and nothing in between. */
const SLOW_MS = 12 * 60_000
/** How often to look at what's left of the allowance; looking doesn't use any. */
const LIMIT_MS = 10 * 60_000
/** Below this many REST calls (or GraphQL points) left in the hour, Canopy slows down. */
const LOW_CORE = 500
const LOW_GRAPHQL = 300

const live = (r: GhRun) => r.state === 'running' || r.state === 'queued'
const byUrgency = (a: GhRun, b: GhRun) => Number(live(b)) - Number(live(a)) || b.startedAt - a.startedAt

/**
 * GitHub data for GitHub HQ in the 3D World and the GitHub window: the repos, their open PRs and
 * the week's workflow runs, read while either is open. The last good read is saved on disk, so both
 * fill in straight away on launch while a fresh one comes in. Reads pause while Canopy is hidden,
 * and slow right down when the hour's GitHub API allowance runs low. Hidden repos are never read,
 * and drop out of what's shown the moment they're hidden.
 */
export const useGhWorldStore = defineStore('ghworld', () => {
  const P = useProjectsStore()
  const R = useReviewsStore()
  const prefs = usePrefsStore()

  /** The repos the user has hidden, lowercased. */
  const hidden = computed(() => new Set((prefs.prefs.ghHidden || []).map(n => n.toLowerCase())))
  const isHidden = (repo: string) => hidden.value.has(repo.toLowerCase())

  /** The last read as it came, and as shown: without the hidden repos, so hiding one takes effect at once. */
  const raw = ref<GhWorld | null>(null)
  const world = computed<GhWorld | null>(() => {
    const w = raw.value
    if (!w || !hidden.value.size) return w
    const keep = (x: { repo: string }) => !isHidden(x.repo)
    return { ...w, repos: w.repos.filter(r => !isHidden(r.name)), pulls: w.pulls.filter(keep), runs: w.runs.filter(keep) }
  })
  const loading = ref(false)
  const limit = ref<GhRateLimit | null>(null)
  let full: ReturnType<typeof setInterval> | null = null
  let liveTimer: ReturnType<typeof setInterval> | null = null
  let cacheTried = false

  /** The allowance is running low and hasn't reset yet: read as little as possible. */
  const slow = computed(() => {
    const l = limit.value
    if (!l) return false
    const now = Date.now()
    return (l.core.remaining < LOW_CORE && l.core.reset > now) || (l.graphql.remaining < LOW_GRAPHQL && l.graphql.reset > now)
  })
  /** When the allowance that ran low comes back. */
  const resetsAt = computed(() => {
    const l = limit.value
    if (!l) return 0
    return Math.max(l.core.remaining < LOW_CORE ? l.core.reset : 0, l.graphql.remaining < LOW_GRAPHQL ? l.graphql.reset : 0)
  })

  /** Open PRs, with the ones waiting for the user's review marked, including those from repos the HQ doesn't hold. */
  const pulls = computed<GhPull[]>(() => {
    const mine = new Map(R.prs.map(p => [p.url, p]))
    const list = (world.value?.pulls || []).map(p => (mine.has(p.url) ? { ...p, review: 'mine' as const } : p))
    const have = new Set(list.map(p => p.url))
    for (const p of R.prs) {
      if (!have.has(p.url)) list.push({ url: p.url, repo: p.repo, number: p.number, title: p.title, author: p.author, createdAt: p.createdAt, review: 'mine', checks: null })
    }
    return list
  })

  /** The latest run of each workflow, for GitHub HQ's factory; the Workflows screen shows every run. */
  const latestRuns = computed<GhRun[]>(() => {
    const seen = new Set<string>()
    return (world.value?.runs || []).filter((r) => {
      const k = `${r.repo}|${r.workflow}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  })

  const offscreen = () => typeof document !== 'undefined' && document.hidden

  async function checkLimit(force = false) {
    if (!force && limit.value && Date.now() - limit.value.at < LIMIT_MS) return
    limit.value = (await api.gh.rateLimit()) ?? limit.value
  }

  /** A full read; skipped while hidden, and spaced right out while the allowance is low. */
  async function read(force = false) {
    if (loading.value) return
    if (!force && offscreen()) return
    await checkLimit()
    if (!force && slow.value && world.value && Date.now() - world.value.at < SLOW_MS) return
    loading.value = true
    try {
      const folders = [...new Set(P.projects.flatMap(p => p.repos.map(r => r.path)).filter(Boolean))]
      // A plain copy: IPC can't send a reactive array.
      const w = await api.gh.world(folders, [...(prefs.prefs.ghHidden || [])])
      // A failed read keeps the last good one on screen, with its error.
      raw.value = w.error && raw.value ? { ...raw.value, error: w.error, problem: w.problem } : w
    } finally {
      loading.value = false
    }
  }

  /** Reads these repos' runs again and swaps them in: after a re-run, a new run, or while one is going. */
  async function refreshRepos(repos: string[]) {
    const w = raw.value
    if (!w || !repos.length) return
    const fresh = await api.gh.runs(repos)
    if (raw.value !== w) return
    const set = new Set(repos)
    raw.value = { ...w, runs: [...w.runs.filter(r => !set.has(r.repo)), ...fresh].sort(byUrgency) }
  }

  /** Follows runs in progress: just the runs of the repos that have one going. */
  async function readLive() {
    if (offscreen() || slow.value || loading.value) return
    const repos = [...new Set((world.value?.runs || []).filter(live).map(r => r.repo))]
    await refreshRepos(repos)
  }

  /** How many views (the 3D World, the GitHub window) are showing it; it is read while any is. */
  let users = 0

  async function start() {
    users++
    if (full) return
    full = setInterval(() => read(), FULL_MS)
    liveTimer = setInterval(readLive, LIVE_MS)
    // Last time's read first, so there is something to show while the fresh one comes in.
    if (!raw.value && !cacheTried) {
      cacheTried = true
      const cached = await api.gh.cachedWorld().catch(() => null)
      if (cached && !raw.value) raw.value = cached
    }
    if (!raw.value || Date.now() - raw.value.at > 60_000) read(true)
  }

  let refill: ReturnType<typeof setTimeout> | null = null

  /**
   * Hides a repo, or shows it again. A read follows shortly, once the user is done toggling: to put
   * the next most active repo in a hidden one's place, or to read one shown again.
   */
  function toggleHidden(repo: string) {
    const list = prefs.prefs.ghHidden || []
    prefs.set({ ghHidden: isHidden(repo) ? list.filter(n => n.toLowerCase() !== repo.toLowerCase()) : [...list, repo] })
    if (refill) clearTimeout(refill)
    refill = setTimeout(() => {
      refill = null
      if (users) read(true)
    }, 2000)
  }

  function stop() {
    users = Math.max(0, users - 1)
    if (users) return
    if (full) clearInterval(full)
    if (liveTimer) clearInterval(liveTimer)
    full = liveTimer = null
  }

  // Back from the tray or a minimised window: catch up if a read was missed meanwhile.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && users && (!raw.value || Date.now() - raw.value.at > FULL_MS)) read()
    })
  }

  return { world, pulls, latestRuns, loading, limit, slow, resetsAt, isHidden, toggleHidden, read, readLive, refreshRepos, checkLimit, start, stop }
})
