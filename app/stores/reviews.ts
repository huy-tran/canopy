import { defineStore } from 'pinia'
import type { GhProblem, ReviewRequest } from '#shared/types'

/** How often gh is asked for pull requests waiting on the user's review. */
const POLL_MS = 5 * 60_000

/** Pull requests waiting for the user's review: a notification for each new request and a reminder while any are left. */
export const useReviewsStore = defineStore('reviews', () => {
  const prefsStore = usePrefsStore()

  const prs = ref<ReviewRequest[]>([])
  /** Why the last check failed, such as gh missing or signed out; empty when it worked. */
  const error = ref('')
  /** Set when gh is missing or signed out, which needs the user to fix; being offline is left out. */
  const problem = ref<GhProblem | null>(null)
  let loaded = false
  let seen = new Set<string>()
  /** When the user was last told about waiting reviews, for the repeat reminder. */
  let toldAt = 0
  let timer: ReturnType<typeof setInterval> | null = null

  function notify(title: string, body: string) {
    const pr = prefsStore.prefs
    if (pr.dnd) return
    // Clicking opens the GitHub view.
    api.sys.notify({ title, body, sid: GH_TERM, silent: !pr.sound })
  }

  const line = (p: ReviewRequest) => `${p.repo.split('/').pop()} #${p.number} · ${p.title}`

  async function poll() {
    const r = await api.gh.reviews()
    if (!r.ok) {
      error.value = r.error || 'Could not reach GitHub.'
      const p = r.problem === 'missing' || r.problem === 'auth' ? r.problem : null
      // Said once when it starts, not on every check.
      if (p && p !== problem.value) {
        useUiStore().toast(p === 'missing'
          ? { title: 'Review notifications are off', body: 'The GitHub CLI (gh) isn\'t installed. Install it with: winget install --id GitHub.cli', error: true }
          : { title: 'Review notifications are off', body: 'The GitHub CLI isn\'t signed in. Run: gh auth login', error: true })
      }
      problem.value = p
      return
    }
    error.value = ''
    problem.value = null
    const fresh = r.prs.filter(p => !seen.has(p.url))
    const first = !loaded
    loaded = true
    prs.value = r.prs
    // Reviewed ones drop out, so a request made again after changes counts as new.
    seen = new Set(r.prs.map(p => p.url))
    const pr = prefsStore.prefs
    const now = Date.now()
    if (!r.prs.length) {
      toldAt = now
      return
    }
    if (first) {
      if (pr.reviewNotify) notify(`${plural(r.prs.length, 'pull request')} waiting for your review`, r.prs.slice(0, 3).map(line).join('\n'))
      toldAt = now
      return
    }
    if (fresh.length) {
      if (pr.reviewNotify) {
        if (fresh.length <= 3) fresh.forEach(p => notify(`${p.author} requested your review`, line(p)))
        else notify(`${fresh.length} new review requests`, fresh.slice(0, 3).map(line).join('\n'))
      }
      toldAt = now
      return
    }
    if (pr.reviewRemind > 0 && now - toldAt >= pr.reviewRemind * 60_000) {
      const oldest = r.prs.reduce((a, b) => (b.createdAt < a.createdAt ? b : a))
      notify(`Still waiting for your review: ${plural(r.prs.length, 'pull request')}`, `Oldest: ${line(oldest)} · ${ago(now - oldest.createdAt)} ago`)
      toldAt = now
    }
  }

  function start() {
    if (timer) return
    setTimeout(poll, 10_000)
    timer = setInterval(poll, POLL_MS)
  }

  return { prs, error, problem, poll, start }
})

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
