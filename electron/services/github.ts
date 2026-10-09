// Everything Canopy reads from and does on GitHub, through the gh CLI and its existing sign-in:
// review requests, the GitHub window's PRs, repos, runs and alerts, and GitHub HQ in the 3D World.
import { execFile } from 'node:child_process'
import os from 'node:os'
import { load as loadYaml } from 'js-yaml'
import type {
  GhAlert, GhDispatchable, GhDone, GhRateLimit, GhProblem, GhPull, GhPullDetail, GhRepo, GhRepoInfo, GhRun, GhRunDetail, GhWorkflowInput, GhWorld, ReviewRequest,
} from '../../shared/types'

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


// ---------------------------------------------------------------- GitHub HQ

/** How many repos GitHub HQ covers, and a ceiling on the runs a read keeps (each repo gives at most RUNS_PER_REPO). */
const MAX_REPOS = 24
const MAX_RUNS = 1500
/** Runs read per repo: enough that a workflow on a busy schedule doesn't push the others out of the week. */
const RUNS_PER_REPO = 50
/** Runs older than this are left out of the factory. */
const RUN_DAYS = 7

/** Runs gh from the home folder, so commands such as `pr merge --delete-branch` never touch a local checkout. */
function runGh(args: string[]): Promise<{ out: string; err: Error | null; stderr: string }> {
  return new Promise((resolve) => {
    execFile('gh', args, { cwd: os.homedir(), windowsHide: true, encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ out: stdout || '', err, stderr: (stderr || '').trim() }))
  })
}

function problemOf(err: Error, stderr: string): GhProblem {
  if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
  return (err as any).code === 4 || /gh auth login/i.test(stderr) ? 'auth' : 'other'
}

/** owner/name of a folder's GitHub origin, or null for a folder that isn't one. */
function githubRepoOf(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['remote', 'get-url', 'origin'], { cwd, windowsHide: true, encoding: 'utf8', timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve(null)
      const remote = stdout.trim()
      // ssh://git@host/owner/repo.git, https://host/owner/repo(.git) or git@host-alias:owner/repo.git
      const m = remote.match(/^\w+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/) || remote.match(/^(?:[\w.-]+@)?([^:/]+)[:/](.+?)(?:\.git)?\/?$/)
      // SSH host aliases such as "github-work" still point at github.com.
      if (!m || !/github/i.test(m[1]!)) return resolve(null)
      const name = m[2]!.replace(/^\/+/, '')
      resolve(/^[\w.-]+\/[\w.-]+$/.test(name) ? name : null)
    })
  })
}

/** Runs `fn` over `items`, `limit` at a time. */
async function pool<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const j = i++
      res[j] = await fn(items[j]!)
    }
  }))
  return res
}

const REPO_FIELDS = `
  nameWithOwner url isPrivate pushedAt
  pullRequests(states: OPEN, first: 30, orderBy: {field: CREATED_AT, direction: DESC}) {
    totalCount
    nodes { number title url createdAt isDraft author { login } reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
  }
  vulnerabilityAlerts(states: OPEN, first: 100) { totalCount nodes { securityVulnerability { severity } } }`

const CHECKS: Record<string, GhPull['checks']> = { SUCCESS: 'pass', FAILURE: 'fail', ERROR: 'fail', PENDING: 'pending', EXPECTED: 'pending' }

/** Repos, their open PRs and their alerts, a dozen repos per GraphQL query. Repos gh can't see are left out. */
async function readRepos(names: string[], canopy: Set<string>): Promise<{ repos: GhRepo[]; pulls: GhPull[] }> {
  const repos: GhRepo[] = [], pulls: GhPull[] = []
  for (let i = 0; i < names.length; i += 12) {
    const body = names.slice(i, i + 12).map((n, j) => {
      const [owner, name] = n.split('/')
      return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${REPO_FIELDS} }`
    }).join('\n')
    // Errors for one repo (no access, or alerts hidden) still come with the others' data.
    const r = await runGh(['api', 'graphql', '-f', `query=query { ${body} }`])
    let data: Record<string, any> = {}
    try {
      data = JSON.parse(r.out).data || {}
    } catch {
      if (r.err) throw Object.assign(new Error(r.stderr || r.err.message), { problem: problemOf(r.err, r.stderr) })
    }
    for (const v of Object.values(data)) {
      if (!v) continue
      // Severities are counted from the first 100 alerts; `total` counts them all.
      const sev = { critical: 0, high: 0, moderate: 0, low: 0, total: v.vulnerabilityAlerts?.totalCount || 0 }
      for (const a of v.vulnerabilityAlerts?.nodes || []) {
        const s = String(a.securityVulnerability?.severity || '').toLowerCase() as 'critical' | 'high' | 'moderate' | 'low'
        if (s in sev) sev[s]++
      }
      repos.push({
        name: v.nameWithOwner, url: v.url, private: v.isPrivate, pushedAt: Date.parse(v.pushedAt) || 0,
        canopy: canopy.has(v.nameWithOwner.toLowerCase()), alerts: v.vulnerabilityAlerts ? sev : null, openPulls: v.pullRequests.totalCount,
      })
      for (const p of v.pullRequests.nodes) {
        const state = p.commits.nodes[0]?.commit.statusCheckRollup?.state
        pulls.push({
          url: p.url, repo: v.nameWithOwner, number: p.number, title: p.title, author: p.author?.login || 'ghost', createdAt: Date.parse(p.createdAt),
          review: p.isDraft ? 'draft' : p.reviewDecision === 'APPROVED' ? 'approved' : p.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : 'waiting',
          checks: state ? CHECKS[state] ?? null : null,
        })
      }
    }
  }
  return { repos, pulls }
}

const RUN_STATE: Record<string, GhRun['state']> = { success: 'success', failure: 'failure', timed_out: 'failure', startup_failure: 'failure', action_required: 'failure', cancelled: 'cancelled', skipped: 'skipped', neutral: 'skipped', stale: 'skipped' }
const RUN_JQ = '[.workflow_runs[] | {id, name, status, conclusion, head_branch, html_url, run_started_at, display_title, event}]'

function runState(status: string, conclusion: string | null): GhRun['state'] {
  if (status === 'completed') return RUN_STATE[conclusion || ''] ?? 'skipped'
  return ['queued', 'waiting', 'pending', 'requested'].includes(status) ? 'queued' : 'running'
}

/**
 * Every workflow run in these repos from the last week, running or queued first, then the newest.
 * The GitHub window's Workflows screen shows them all; GitHub HQ picks the latest of each workflow.
 */
export async function workflowRuns(repos: string[]): Promise<GhRun[]> {
  const since = Date.now() - RUN_DAYS * 86_400_000
  const lists = await pool(repos, 6, async (repo) => {
    const r = await runGh(['api', `/repos/${repo}/actions/runs?per_page=${RUNS_PER_REPO}`, '--jq', RUN_JQ])
    if (r.err) return []
    try {
      return (JSON.parse(r.out) as any[]).flatMap((w): GhRun[] => {
        const startedAt = Date.parse(w.run_started_at) || 0
        if (startedAt < since) return []
        return [{ id: w.id, url: w.html_url, repo, workflow: w.name, title: w.display_title || '', branch: w.head_branch || '', event: w.event || '', state: runState(w.status, w.conclusion), startedAt }]
      })
    } catch {
      return []
    }
  })
  const live = (r: GhRun) => r.state === 'running' || r.state === 'queued'
  return lists.flat().sort((a, b) => Number(live(b)) - Number(live(a)) || b.startedAt - a.startedAt).slice(0, MAX_RUNS)
}

/**
 * The repos behind the Canopy projects (from their folders' origins) and the user's most active repos, with their PRs and runs.
 * Hidden repos are left out before anything is read about them, and the next most active take their places.
 */
export async function githubWorld(folders: string[], hidden: string[]): Promise<GhWorld> {
  const at = Date.now()
  const skip = new Set(hidden.map(n => n.toLowerCase()))
  const perPage = Math.min(100, MAX_REPOS + skip.size)
  const active = await runGh(['api', `/user/repos?sort=pushed&per_page=${perPage}&affiliation=owner,collaborator,organization_member`, '--jq', '[.[] | .full_name]'])
  if (active.err) return { repos: [], pulls: [], runs: [], at, error: active.stderr || active.err.message, problem: problemOf(active.err, active.stderr) }
  const mine = (await Promise.all(folders.map(githubRepoOf))).filter((n): n is string => !!n)
  const canopy = new Set(mine.map(n => n.toLowerCase()))
  const names: string[] = []
  const seen = new Set(skip)
  // Canopy's repos first, so the library always holds them.
  for (const n of [...mine, ...(JSON.parse(active.out || '[]') as string[])]) {
    if (seen.has(n.toLowerCase())) continue
    seen.add(n.toLowerCase())
    names.push(n)
  }
  try {
    const { repos, pulls } = await readRepos(names.slice(0, MAX_REPOS), canopy)
    repos.sort((a, b) => Number(b.canopy) - Number(a.canopy) || b.pushedAt - a.pushedAt)
    const runs = await workflowRuns(repos.map(r => r.name))
    return { repos, pulls, runs, at }
  } catch (e: any) {
    return { repos: [], pulls: [], runs: [], at, error: String(e?.message || e), problem: e?.problem || 'other' }
  }
}

/** How much of the hour's GitHub API allowance is left, for Canopy to slow down before it runs out. */
export async function rateLimit(): Promise<GhRateLimit | null> {
  const r = await runGh(['api', 'rate_limit', '--jq', '{core: .resources.core, graphql: .resources.graphql}'])
  if (r.err) return null
  try {
    const x = JSON.parse(r.out)
    const one = (v: any) => ({ limit: v.limit, remaining: v.remaining, reset: v.reset * 1000 })
    return { core: one(x.core), graphql: one(x.graphql), at: Date.now() }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- the GitHub view

const done = (r: { err: Error | null; stderr: string }): GhDone => (r.err ? { ok: false, error: r.stderr || r.err.message } : { ok: true })

let viewer: string | null = null

/** The signed-in user's login, asked for once. */
async function viewerLogin(): Promise<string> {
  if (viewer) return viewer
  const r = await runGh(['api', 'user', '--jq', '.login'])
  if (!r.err) viewer = r.out.trim()
  return viewer || ''
}

const SEARCH_QUERY = `query($q: String!) { search(query: $q, type: ISSUE, first: 50) { nodes { ... on PullRequest {
  number title url createdAt isDraft author { login } repository { nameWithOwner } reviewDecision
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
} } } }`

/** Open PRs from a GitHub search, such as `review-requested:@me` or `author:@me`, with their review and checks. */
export async function searchPulls(filter: string): Promise<{ ok: boolean; pulls: GhPull[]; error?: string; problem?: GhProblem }> {
  const r = await runGh(['api', 'graphql', '-f', `query=${SEARCH_QUERY}`, '-f', `q=is:pr is:open archived:false ${filter}`])
  if (r.err) return { ok: false, pulls: [], error: r.stderr || r.err.message, problem: problemOf(r.err, r.stderr) }
  try {
    const nodes = (JSON.parse(r.out).data?.search?.nodes || []) as any[]
    const mine = /review-requested:@me/.test(filter)
    const pulls = nodes.filter(p => p?.url).map((p): GhPull => {
      const state = p.commits.nodes[0]?.commit.statusCheckRollup?.state
      return {
        url: p.url, repo: p.repository.nameWithOwner, number: p.number, title: p.title, author: p.author?.login || 'ghost', createdAt: Date.parse(p.createdAt),
        review: mine ? 'mine' : p.isDraft ? 'draft' : p.reviewDecision === 'APPROVED' ? 'approved' : p.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : 'waiting',
        checks: state ? CHECKS[state] ?? null : null,
      }
    })
    return { ok: true, pulls }
  } catch (e: any) {
    return { ok: false, pulls: [], error: String(e?.message || e), problem: 'other' }
  }
}

const PR_FIELDS = 'number,title,body,url,state,isDraft,author,baseRefName,headRefName,createdAt,additions,deletions,files,mergeable,mergeStateStatus,reviewDecision,reviewRequests,latestReviews,statusCheckRollup,comments'

function checkOf(c: any): GhPullDetail['checks'][number] {
  if (c.__typename === 'StatusContext') {
    const s = String(c.state || '')
    return { name: c.context || 'status', url: c.targetUrl || '', state: s === 'SUCCESS' ? 'pass' : s === 'FAILURE' || s === 'ERROR' ? 'fail' : 'pending' }
  }
  const concl = String(c.conclusion || '')
  const state = c.status !== 'COMPLETED' ? 'pending' : concl === 'SUCCESS' ? 'pass' : concl === 'SKIPPED' || concl === 'NEUTRAL' ? 'skipped' : 'fail'
  return { name: c.workflowName && c.name !== c.workflowName ? `${c.workflowName} / ${c.name}` : c.name || 'check', url: c.detailsUrl || '', state }
}

/** A PR with its files, reviews, checks and comments, and the repo's merge settings. */
export async function pullDetail(url: string): Promise<{ ok: boolean; pull?: GhPullDetail; error?: string }> {
  const repo = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1]
  if (!repo) return { ok: false, error: `Not a pull request link: ${url}` }
  const [pr, settings, me] = await Promise.all([
    runGh(['pr', 'view', url, '--json', PR_FIELDS]),
    runGh(['repo', 'view', repo, '--json', 'mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed,deleteBranchOnMerge,viewerPermission']),
    viewerLogin(),
  ])
  if (pr.err) return { ok: false, error: pr.stderr || pr.err.message }
  try {
    const p = JSON.parse(pr.out)
    const s = settings.err ? {} : JSON.parse(settings.out)
    const reviewers: GhPullDetail['reviewers'] = (p.latestReviews || []).map((r: any) => ({ login: r.author?.login || 'ghost', state: r.state }))
    for (const q of p.reviewRequests || []) {
      const login = q.login || q.name || q.slug
      if (login && !reviewers.some(r => r.login === login)) reviewers.push({ login, state: 'REQUESTED' })
    }
    return {
      ok: true,
      pull: {
        url: p.url, repo, number: p.number, title: p.title, body: p.body || '', state: p.state, draft: p.isDraft, author: p.author?.login || 'ghost',
        createdAt: Date.parse(p.createdAt), base: p.baseRefName, head: p.headRefName, additions: p.additions, deletions: p.deletions,
        files: (p.files || []).map((f: any) => ({ path: f.path, additions: f.additions, deletions: f.deletions })),
        mergeable: p.mergeable || 'UNKNOWN', mergeState: p.mergeStateStatus || '', reviewDecision: p.reviewDecision || '', reviewers,
        checks: (p.statusCheckRollup || []).map(checkOf),
        comments: (p.comments || []).map((c: any) => ({ author: c.author?.login || 'ghost', body: c.body || '', at: Date.parse(c.createdAt) })),
        merge: {
          merge: s.mergeCommitAllowed ?? true, squash: s.squashMergeAllowed ?? true, rebase: s.rebaseMergeAllowed ?? true, deleteBranch: !!s.deleteBranchOnMerge,
          allowed: ['ADMIN', 'MAINTAIN', 'WRITE'].includes(s.viewerPermission),
        },
        mine: !!me && p.author?.login === me,
      },
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** The PR's changes as one unified diff. */
export async function pullDiff(url: string): Promise<{ ok: boolean; diff?: string; error?: string }> {
  const r = await runGh(['pr', 'diff', url, '--color', 'never'])
  return r.err ? { ok: false, error: r.stderr || r.err.message } : { ok: true, diff: r.out }
}

/** Approves, asks for changes on, or comments on a PR. */
export async function reviewPull(url: string, kind: 'approve' | 'request-changes' | 'comment', body: string): Promise<GhDone> {
  const args = ['pr', 'review', url, `--${kind}`]
  if (body.trim()) args.push('--body', body.trim())
  return done(await runGh(args))
}

/** Merges a PR by merge commit, squash or rebase, optionally deleting its branch on GitHub. */
export async function mergePull(url: string, method: 'merge' | 'squash' | 'rebase', deleteBranch: boolean): Promise<GhDone> {
  const args = ['pr', 'merge', url, `--${method}`]
  if (deleteBranch) args.push('--delete-branch')
  return done(await runGh(args))
}

const RUN_FIELDS = 'jobs,name,displayTitle,status,conclusion,headBranch,event,url,createdAt,attempt,workflowName,databaseId'

export async function runDetail(repo: string, id: number): Promise<{ ok: boolean; run?: GhRunDetail; error?: string }> {
  const r = await runGh(['run', 'view', String(id), '-R', repo, '--json', RUN_FIELDS])
  if (r.err) return { ok: false, error: r.stderr || r.err.message }
  try {
    const w = JSON.parse(r.out)
    return {
      ok: true,
      run: {
        id, repo, url: w.url, workflow: w.workflowName || w.name, title: w.displayTitle || '', branch: w.headBranch || '', event: w.event || '',
        state: runState(w.status, w.conclusion), attempt: w.attempt || 1, createdAt: Date.parse(w.createdAt),
        jobs: (w.jobs || []).map((j: any) => ({
          id: j.databaseId, name: j.name, state: runState(j.status, j.conclusion), url: j.url || '',
          startedAt: Date.parse(j.startedAt) || 0, completedAt: Date.parse(j.completedAt) || 0,
          steps: (j.steps || []).map((s: any) => ({ n: s.number, name: s.name, state: runState(s.status, s.conclusion) })),
        })),
      },
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/** A job's log, or the failed steps' logs of the whole run; only the last few thousand lines. */
export async function runLog(repo: string, id: number, job?: number): Promise<{ ok: boolean; log?: string; error?: string }> {
  const args = job ? ['run', 'view', '--job', String(job), '-R', repo, '--log'] : ['run', 'view', String(id), '-R', repo, '--log-failed']
  const r = await runGh(args)
  if (r.err) return { ok: false, error: r.stderr || r.err.message }
  const lines = r.out.split(/\r?\n/)
  return { ok: true, log: lines.slice(-4000).join('\n') }
}

export async function rerunRun(repo: string, id: number, failedOnly: boolean): Promise<GhDone> {
  return done(await runGh(['run', 'rerun', String(id), '-R', repo, ...(failedOnly ? ['--failed'] : [])]))
}

export async function cancelRun(repo: string, id: number): Promise<GhDone> {
  return done(await runGh(['run', 'cancel', String(id), '-R', repo]))
}

const SEVERITY: Record<string, GhAlert['severity']> = { critical: 'critical', high: 'high', medium: 'moderate', moderate: 'moderate', low: 'low' }
// One alert per line, so every page of a repo with more than 100 alerts can be read.
const ALERT_JQ = '.[] | {number, severity: .security_advisory.severity, pkg: .dependency.package.name, eco: .dependency.package.ecosystem, manifest: .dependency.manifest_path, summary: .security_advisory.summary, ghsa: .security_advisory.ghsa_id, fixed: .security_vulnerability.first_patched_version.identifier, range: .security_vulnerability.vulnerable_version_range, url: .html_url, created: .created_at}'
const RANK = { critical: 0, high: 1, moderate: 2, low: 3 }

/** Open Dependabot alerts in these repos, most severe first. Repos whose alerts the user can't see are skipped. */
export async function securityAlerts(repos: string[]): Promise<GhAlert[]> {
  const lists = await pool(repos, 6, async (repo) => {
    const r = await runGh(['api', '--paginate', `/repos/${repo}/dependabot/alerts?state=open&per_page=100`, '--jq', ALERT_JQ])
    if (r.err) return []
    try {
      return r.out.split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).map((a): GhAlert => ({
        repo, number: a.number, severity: SEVERITY[a.severity] || 'low', pkg: a.pkg || '', ecosystem: a.eco || '', manifest: a.manifest || '',
        summary: a.summary || '', ghsa: a.ghsa || '', fixed: a.fixed || null, range: a.range || '', url: a.url, createdAt: Date.parse(a.created) || 0,
      }))
    } catch {
      return []
    }
  })
  return lists.flat().sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.createdAt - a.createdAt)
}

const REPO_JQ = '.[] | {name: .full_name, url: .html_url, description, private, archived, fork, language, defaultBranch: .default_branch, stars: .stargazers_count, pushedAt: .pushed_at}'

/** Every repo the user can reach (their own, their orgs', and ones they collaborate on), most recently pushed first. */
export async function allRepos(): Promise<{ ok: boolean; repos: GhRepoInfo[]; error?: string; problem?: GhProblem }> {
  const r = await runGh(['api', '--paginate', '/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member', '--jq', REPO_JQ])
  if (r.err) return { ok: false, repos: [], error: r.stderr || r.err.message, problem: problemOf(r.err, r.stderr) }
  try {
    const repos = r.out.split('\n').filter(l => l.trim()).map((l): GhRepoInfo => {
      const x = JSON.parse(l)
      return { ...x, description: x.description || '', language: x.language || '', pushedAt: Date.parse(x.pushedAt) || 0 }
    })
    return { ok: true, repos: repos.sort((a, b) => b.pushedAt - a.pushedAt) }
  } catch (e: any) {
    return { ok: false, repos: [], error: String(e?.message || e), problem: 'other' }
  }
}

// ---------------------------------------------------------------- running a workflow by hand

/** The `workflow_dispatch` trigger of a workflow file, or undefined when it can't be run by hand. */
function dispatchOf(yamlText: string): { inputs?: Record<string, any> } | null | undefined {
  const doc = loadYaml(yamlText) as any
  // YAML 1.1 readers turn the key `on` into true; js-yaml keeps it, but allow both.
  const on = doc?.on ?? doc?.true
  if (on === 'workflow_dispatch') return null
  if (Array.isArray(on)) return on.includes('workflow_dispatch') ? null : undefined
  if (on && typeof on === 'object' && 'workflow_dispatch' in on) return on.workflow_dispatch || null
  return undefined
}

/** The repo's workflows that can be run by hand, with the inputs each asks for. */
export async function dispatchables(repo: string): Promise<{ ok: boolean; workflows: GhDispatchable[]; error?: string }> {
  const list = await runGh(['workflow', 'list', '-R', repo, '--json', 'id,name,path,state'])
  if (list.err) return { ok: false, workflows: [], error: list.stderr || list.err.message }
  const active = (JSON.parse(list.out || '[]') as any[]).filter(w => w.state === 'active' && /\.ya?ml$/.test(w.path))
  let environments: string[] | null = null
  const envs = async () => {
    if (!environments) {
      const r = await runGh(['api', `/repos/${repo}/environments`, '--jq', '.environments[].name'])
      environments = r.err ? [] : r.out.split('\n').filter(Boolean)
    }
    return environments
  }
  const found = await pool(active, 6, async (w): Promise<GhDispatchable | null> => {
    const r = await runGh(['api', `/repos/${repo}/contents/${w.path}`, '--jq', '.content'])
    if (r.err) return null
    try {
      const trigger = dispatchOf(Buffer.from(r.out.replace(/\\n|\s/g, ''), 'base64').toString('utf8'))
      if (trigger === undefined) return null
      const inputs: GhWorkflowInput[] = []
      for (const [name, def] of Object.entries<any>(trigger?.inputs || {})) {
        const type = (['choice', 'boolean', 'number', 'environment'].includes(def?.type) ? def.type : 'string') as GhWorkflowInput['type']
        inputs.push({
          name, type, description: String(def?.description || ''), required: !!def?.required,
          default: def?.default == null ? '' : String(def.default),
          options: type === 'choice' ? (def?.options || []).map(String) : type === 'environment' ? await envs() : [],
        })
      }
      return { id: w.id, name: w.name, path: w.path, inputs }
    } catch {
      return null
    }
  })
  return { ok: true, workflows: found.filter((w): w is GhDispatchable => !!w) }
}

/** The repo's branches, its default branch first. */
export async function branches(repo: string): Promise<string[]> {
  const [list, info] = await Promise.all([
    runGh(['api', '--paginate', `/repos/${repo}/branches?per_page=100`, '--jq', '.[].name']),
    runGh(['repo', 'view', repo, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name']),
  ])
  const names = list.err ? [] : list.out.split('\n').filter(Boolean)
  const main = info.err ? '' : info.out.trim()
  return main ? [main, ...names.filter(n => n !== main)] : names
}

/** Starts a workflow on a branch, with its inputs. */
export async function runWorkflow(repo: string, id: number, ref: string, inputs: Record<string, string>): Promise<GhDone> {
  const args = ['workflow', 'run', String(id), '-R', repo, '--ref', ref]
  for (const [k, v] of Object.entries(inputs)) args.push('-f', `${k}=${v}`)
  return done(await runGh(args))
}
