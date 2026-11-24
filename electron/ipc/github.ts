// GitHub: the PR, run, repo and alert calls, and GitHub HQ's cache.
import { ghCache, handle, store } from '../context'
import { ghAccounts, setProjectAccounts, switchAccount } from '../services/ghaccounts'
import {
  allRepos, branches, cancelRun, createPull, dispatchables, githubRepoOf, githubWorld, mergePull, pullDetail, pullDiff, rateLimit, rerunRun, reviewPull, reviewRequests, runDetail, runLog, runWorkflow, searchPulls, securityAlerts, workflowRuns,
} from '../services/github'

/** The GitHub HQ data last written to the cache, to skip rewriting it unchanged. */
let ghCacheKey = ''

/** The projects' account choices as last worked out, and what they were worked out from. */
let projectAccountsKey = ''

/**
 * Tells the account layer which gh account each project asks for, by its repos' GitHub names.
 * Worked out again only when a project's folders or its choice change.
 */
async function syncProjectAccounts() {
  const picks = (store.get('state')?.projects || []).filter(p => p.ghAccount).flatMap(p => p.repos.filter(r => r.path).map(r => ({ path: r.path, login: p.ghAccount! })))
  const key = JSON.stringify(picks)
  if (key === projectAccountsKey) return
  projectAccountsKey = key
  const names = await Promise.all(picks.map(x => githubRepoOf(x.path)))
  setProjectAccounts(new Map(picks.flatMap((x, i) => (names[i] ? [[names[i]!.toLowerCase(), x.login] as [string, string]] : []))))
}

/** Runs a GitHub call once the projects' account choices are in place. */
const withAccounts = <A extends unknown[], R>(fn: (...a: A) => R) => async (...a: A) => {
  await syncProjectAccounts().catch(() => undefined)
  return fn(...a)
}

export function registerGithubIpc() {
  handle('gh:accounts', () => ghAccounts())
  handle('gh:switch', (login: string) => switchAccount(login))
  handle('gh:reviews', withAccounts(() => reviewRequests()))
  handle('gh:world', async (folders: string[], hidden: string[]) => {
    await syncProjectAccounts().catch(() => undefined)
    const w = await githubWorld(folders, hidden || [])
    if (!w.error) {
      // Only the data counts as a change, not the time it was read.
      const key = JSON.stringify({ ...w, at: 0 })
      if (key !== ghCacheKey) {
        ghCacheKey = key
        setImmediate(() => ghCache.set('world', w))
      }
    }
    return w
  })
  handle('gh:cachedWorld', async () => {
    const w = ghCache.get('world') ?? null
    if (!w) return null
    // A read saved while another account was active would show that account's repos until the fresh one lands.
    const a = await ghAccounts()
    return a.active && w.account !== a.active ? null : w
  })
  handle('gh:runs', withAccounts((repos: string[]) => workflowRuns(repos)))
  handle('gh:rateLimit', () => rateLimit())
  handle('gh:search', withAccounts((filter: string) => searchPulls(filter)))
  handle('gh:pull', withAccounts((url: string) => pullDetail(url)))
  handle('gh:pullDiff', withAccounts((url: string) => pullDiff(url)))
  handle('gh:review', withAccounts((url: string, kind: 'approve' | 'request-changes' | 'comment', body: string) => reviewPull(url, kind, body)))
  handle('gh:merge', withAccounts((url: string, method: 'merge' | 'squash' | 'rebase', deleteBranch: boolean) => mergePull(url, method, deleteBranch)))
  handle('gh:createPull', withAccounts((cwd: string, base: string) => createPull(String(cwd), String(base))))
  handle('gh:run', withAccounts((repo: string, id: number) => runDetail(repo, id)))
  handle('gh:runLog', withAccounts((repo: string, id: number, job?: number) => runLog(repo, id, job)))
  handle('gh:rerun', withAccounts((repo: string, id: number, failedOnly: boolean) => rerunRun(repo, id, failedOnly)))
  handle('gh:cancel', withAccounts((repo: string, id: number) => cancelRun(repo, id)))
  handle('gh:alerts', withAccounts((repos: string[]) => securityAlerts(repos)))
  handle('gh:repos', () => allRepos())
  handle('gh:dispatchables', withAccounts((repo: string, ref?: string) => dispatchables(repo, ref)))
  handle('gh:branches', withAccounts((repo: string) => branches(repo)))
  handle('gh:runWorkflow', withAccounts((repo: string, id: number, ref: string, inputs: Record<string, string>) => runWorkflow(repo, id, ref, inputs)))
}
