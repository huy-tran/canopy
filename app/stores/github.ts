import { defineStore } from 'pinia'
import type { GhAlert, GhPull, GhRepoInfo, GhRun } from '#shared/types'

export type GhTab = 'reviews' | 'mine' | 'repos' | 'runs' | 'security'
/** The sections in the order the sidebar lists them. */
export const GH_TABS: GhTab[] = ['reviews', 'mine', 'repos', 'runs', 'security']

/**
 * The GitHub view's screens: which one is open (a list, a repo, a PR or a run) and the lists they
 * show, all read with the gh CLI. Workflows and Security cover GitHub HQ's repos: the Canopy
 * projects' repos and the user's most active. Repos lists every repo the user can reach.
 */
export const useGithubStore = defineStore('github', () => {
  const GW = useGhWorldStore()
  const R = useReviewsStore()

  const tab = ref<GhTab>('reviews')
  /** Where the keyboard is: the sidebar (arrows pick a section) or the section's content. */
  const pane = ref<'nav' | 'main'>('nav')
  /** A repo opened from the Repos list; a PR or run opened from a list or a repo, shown in place of it. */
  const repo = ref<string | null>(null)
  const pr = ref<string | null>(null)
  const run = ref<{ repo: string; id: number } | null>(null)

  const reviews = ref<GhPull[] | null>(null)
  const mine = ref<GhPull[] | null>(null)
  const repoList = ref<GhRepoInfo[] | null>(null)
  /** The Workflows screen's runs: the same read as GitHub HQ's, so they aren't fetched twice. */
  const runs = computed<GhRun[] | null>(() => GW.world?.runs ?? null)
  const alerts = ref<GhAlert[] | null>(null)
  const busy = ref<Partial<Record<GhTab, boolean>>>({})
  const errors = ref<Partial<Record<GhTab, string>>>({})
  /** The repo a workflow is being started in, while the Run workflow dialog is open. */
  const dispatch = ref<string | null>(null)

  function go(t: GhTab) {
    tab.value = t
    repo.value = null
    pr.value = null
    run.value = null
    load(t)
  }

  // Opening something puts the keyboard in the content, where it is.
  function openRepo(name: string) {
    repo.value = name
    pr.value = null
    run.value = null
    pane.value = 'main'
  }

  function openPull(url: string) {
    pr.value = url
    run.value = null
    pane.value = 'main'
  }

  function openRun(repoName: string, id: number) {
    run.value = { repo: repoName, id }
    pr.value = null
    pane.value = 'main'
  }

  /**
   * One step back: from a PR or run to the repo or list it was opened from, from a repo to the list,
   * and from a list out to the sidebar. Never further: only the toggle closes the window.
   */
  function back() {
    if (pr.value || run.value) {
      pr.value = null
      run.value = null
    } else if (repo.value) repo.value = null
    else pane.value = 'nav'
  }

  /** In the sidebar: the next or previous section, shown straight away. */
  function step(d: number) {
    const i = GH_TABS.indexOf(tab.value)
    const next = GH_TABS[Math.min(GH_TABS.length - 1, Math.max(0, i + d))]
    if (next && next !== tab.value) go(next)
  }

  /** The repos Workflows and Security cover, read first if GitHub HQ hasn't been. */
  async function hqRepos() {
    if (!GW.world) await GW.read(true)
    return GW.world?.repos || []
  }

  /** Reads a tab's list; a list already read shows straight away while it refreshes. */
  async function load(t: GhTab, force = false) {
    if (busy.value[t]) return
    const have = { reviews: reviews.value, mine: mine.value, repos: repoList.value, runs: runs.value, security: alerts.value }[t]
    if (have && !force && t !== 'reviews') return
    busy.value = { ...busy.value, [t]: true }
    try {
      if (t === 'reviews' || t === 'mine') {
        const r = await api.gh.search(t === 'reviews' ? 'review-requested:@me' : 'author:@me')
        errors.value = { ...errors.value, [t]: r.ok ? '' : r.error }
        if (r.ok) {
          if (t === 'reviews') reviews.value = r.pulls
          else mine.value = r.pulls
        }
        // Keep the badge on the GitHub button in step.
        if (t === 'reviews') R.poll()
      } else if (t === 'repos') {
        const r = await api.gh.repos()
        errors.value = { ...errors.value, repos: r.ok ? '' : r.error }
        if (r.ok) repoList.value = r.repos
      } else if (t === 'runs') {
        // Shared with GitHub HQ: a refresh is a full read; otherwise whatever was read last is shown.
        if (force || !GW.world) await GW.read(true)
        errors.value = { ...errors.value, runs: GW.world?.error || '' }
      } else if (t === 'security') {
        const list = (await hqRepos()).filter(r => r.alerts?.total)
        alerts.value = await api.gh.alerts(list.map(r => r.name))
        errors.value = { ...errors.value, security: GW.world?.error || '' }
      }
    } finally {
      busy.value = { ...busy.value, [t]: false }
    }
  }

  /** After approving, merging and the like: the lists that may have changed. */
  function changed() {
    load('reviews', true)
    if (mine.value) load('mine', true)
  }

  return { tab, pane, repo, pr, run, reviews, mine, repoList, runs, alerts, busy, errors, dispatch, go, step, openRepo, openPull, openRun, back, load, changed }
})
