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
 * and slow right down when the hour's GitHub API allowance runs low.
 */
export const useGhWorldStore = defineStore('ghworld', () => {
  const P = useProjectsStore()
  const R = useReviewsStore()

  const world = ref<GhWorld | null>(null)
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

  const hidden = () => typeof document !== 'undefined' && document.hidden

  async function checkLimit(force = false) {
    if (!force && limit.value && Date.now() - limit.value.at < LIMIT_MS) return
    limit.value = (await api.gh.rateLimit()) ?? limit.value
  }

  /** A full read; skipped while hidden, and spaced right out while the allowance is low. */
  async function read(force = false) {
    if (loading.value) return
    if (!force && hidden()) return
    await checkLimit()
    if (!force && slow.value && world.value && Date.now() - world.value.at < SLOW_MS) return
    loading.value = true
    try {
      const folders = [...new Set(P.projects.flatMap(p => p.repos.map(r => r.path)).filter(Boolean))]
      const w = await api.gh.world(folders)
      // A failed read keeps the last good one on screen, with its error.
      world.value = w.error && world.value ? { ...world.value, error: w.error, problem: w.problem } : w
    } finally {
      loading.value = false
    }
  }

  /** Reads these repos' runs again and swaps them in: after a re-run, a new run, or while one is going. */
  async function refreshRepos(repos: string[]) {
    const w = world.value
    if (!w || !repos.length) return
    const fresh = await api.gh.runs(repos)
    if (world.value !== w) return
    const set = new Set(repos)
    world.value = { ...w, runs: [...w.runs.filter(r => !set.has(r.repo)), ...fresh].sort(byUrgency) }
  }

  /** Follows runs in progress: just the runs of the repos that have one going. */
  async function readLive() {
    if (hidden() || slow.value || loading.value) return
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
    if (!world.value && !cacheTried) {
      cacheTried = true
      const cached = await api.gh.cachedWorld().catch(() => null)
      if (cached && !world.value) world.value = cached
    }
    if (!world.value || Date.now() - world.value.at > 60_000) read(true)
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
      if (!document.hidden && users && (!world.value || Date.now() - world.value.at > FULL_MS)) read()
    })
  }

  return { world, pulls, latestRuns, loading, limit, slow, resetsAt, read, readLive, refreshRepos, checkLimit, start, stop }
})
