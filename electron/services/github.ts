// Pull requests waiting for the user's review, read with the gh CLI and its existing sign-in, and
// finding the terminal app the GitHub view runs.
import { execFile } from 'node:child_process'
import type { GhProblem, ReviewRequest, ToolCheck } from '../../shared/types'

interface SearchHit {
  number: number
  title: string
  url: string
  createdAt: string
  isDraft: boolean
  author: { login: string }
  repository: { nameWithOwner: string }
}

/** Open, non-draft PRs where the user (or one of their teams) is a requested reviewer. */
export function reviewRequests(): Promise<{ ok: boolean; prs: ReviewRequest[]; error?: string; problem?: GhProblem }> {
  const args = ['search', 'prs', '--review-requested=@me', '--state=open', '--limit', '100', '--json', 'number,title,url,createdAt,isDraft,author,repository']
  return new Promise((resolve) => {
    execFile('gh', args, { windowsHide: true, encoding: 'utf8', timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) {
        const error = (stderr || err.message).trim()
        // gh exits with 4 when it has no sign-in.
        const problem: GhProblem = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : err.code === 4 || /gh auth login/i.test(error) ? 'auth' : 'other'
        return resolve({ ok: false, prs: [], error, problem })
      }
      try {
        const hits = JSON.parse(stdout) as SearchHit[]
        const prs = hits.filter(h => !h.isDraft).map(h => ({
          url: h.url, number: h.number, title: h.title, repo: h.repository.nameWithOwner, author: h.author.login, createdAt: Date.parse(h.createdAt),
        }))
        resolve({ ok: true, prs })
      } catch (e: any) {
        resolve({ ok: false, prs: [], error: String(e?.message || e), problem: 'other' })
      }
    })
  })
}

function out(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, encoding: 'utf8', timeout: 10_000 }, (err, stdout) => resolve(err ? null : stdout))
  })
}

const onPath = async (name: string) => (await out('where', [name])) != null

/**
 * The command line the GitHub view should run. A custom command is checked as given; the default
 * tries gh-tui (what install.ps1 builds) and then github-tui (what `go install` builds).
 */
export async function findTool(custom: string): Promise<ToolCheck> {
  const tries = custom.trim() ? [custom.trim()] : ['gh-tui', 'github-tui']
  const [gh, found] = await Promise.all([
    onPath('gh'),
    (async () => {
      for (const c of tries) if (await onPath(c.split(/\s+/)[0]!)) return c
      return null
    })(),
  ])
  const ghDash = gh && /\bgh[- ]dash\b/.test((await out('gh', ['extension', 'list'])) || '')
  return { cmd: found, tried: tries, gh, ghDash }
}
