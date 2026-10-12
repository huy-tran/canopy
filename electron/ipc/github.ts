// GitHub: the PR, run, repo and alert calls, and GitHub HQ's cache.
import { ghCache, handle } from '../context'
import {
  allRepos, branches, cancelRun, dispatchables, githubWorld, mergePull, pullDetail, pullDiff, rateLimit, rerunRun, reviewPull, reviewRequests, runDetail, runLog, runWorkflow, searchPulls, securityAlerts, workflowRuns,
} from '../services/github'

/** The GitHub HQ data last written to the cache, to skip rewriting it unchanged. */
let ghCacheKey = ''

export function registerGithubIpc() {
  handle('gh:reviews', () => reviewRequests())
  handle('gh:world', async (folders: string[], hidden: string[]) => {
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
  handle('gh:cachedWorld', () => ghCache.get('world') ?? null)
  handle('gh:runs', (repos: string[]) => workflowRuns(repos))
  handle('gh:rateLimit', () => rateLimit())
  handle('gh:search', (filter: string) => searchPulls(filter))
  handle('gh:pull', (url: string) => pullDetail(url))
  handle('gh:pullDiff', (url: string) => pullDiff(url))
  handle('gh:review', (url: string, kind: 'approve' | 'request-changes' | 'comment', body: string) => reviewPull(url, kind, body))
  handle('gh:merge', (url: string, method: 'merge' | 'squash' | 'rebase', deleteBranch: boolean) => mergePull(url, method, deleteBranch))
  handle('gh:run', (repo: string, id: number) => runDetail(repo, id))
  handle('gh:runLog', (repo: string, id: number, job?: number) => runLog(repo, id, job))
  handle('gh:rerun', (repo: string, id: number, failedOnly: boolean) => rerunRun(repo, id, failedOnly))
  handle('gh:cancel', (repo: string, id: number) => cancelRun(repo, id))
  handle('gh:alerts', (repos: string[]) => securityAlerts(repos))
  handle('gh:repos', () => allRepos())
  handle('gh:dispatchables', (repo: string) => dispatchables(repo))
  handle('gh:branches', (repo: string) => branches(repo))
  handle('gh:runWorkflow', (repo: string, id: number, ref: string, inputs: Record<string, string>) => runWorkflow(repo, id, ref, inputs))
}
