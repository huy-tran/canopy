// Git and repo inspection for the explorer, pane chips, worktrees and the project form.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { GitChange, GitStatus, RepoInfo } from '../../shared/types'

function git(cwd: string, args: string[], okCodes: number[] = [0]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : -1) : 0
      if (okCodes.includes(code)) resolve(stdout)
      else reject(new Error((stderr || err?.message || '').trim()))
    })
  })
}

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Short stack name from composer.json / package.json, e.g. "Laravel 12", "Nuxt", "Next.js". */
export function detectStack(dir: string): string {
  const composer = readJson(path.join(dir, 'composer.json'))
  if (composer) {
    const v = composer.require?.['laravel/framework']
    if (v) {
      const major = String(v).match(/(\d+)/)
      return major ? `Laravel ${major[1]}` : 'Laravel'
    }
    if (composer.require?.['symfony/framework-bundle']) return 'Symfony'
    return 'PHP'
  }
  const pkg = readJson(path.join(dir, 'package.json'))
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    if (deps.nuxt) return 'Nuxt'
    if (deps.next) return 'Next.js'
    if (deps.astro) return 'Astro'
    if (deps['@sveltejs/kit']) return 'SvelteKit'
    if (deps.vue) return 'Vue'
    if (deps.react) return 'React'
    return 'Node'
  }
  return ''
}

export async function repoInfo(dir: string): Promise<RepoInfo> {
  const exists = !!dir && fs.existsSync(dir)
  if (!exists) return { exists: false, isRepo: false, branch: '', stack: '' }
  const stack = detectStack(dir)
  try {
    const branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    return { exists, isRepo: true, branch, stack }
  } catch {
    return { exists, isRepo: false, branch: '', stack }
  }
}

function parseNumstat(out: string): Map<string, { a: number; d: number }> {
  const m = new Map<string, { a: number; d: number }>()
  for (const line of out.split('\n')) {
    const p = line.split('\t')
    if (p.length < 3) continue
    const file = p.slice(2).join('\t').replace(/^.*\{.* => (.*)\}.*$/, '$1').replace(/^.* => /, '')
    m.set(file, { a: +p[0]! || 0, d: +p[1]! || 0 })
  }
  return m
}

/** Untracked files bigger than this aren't read to count their lines. */
const COUNT_MAX = 512 * 1024
/** Nor more than this many of them. */
const COUNT_FILES = 200

async function lineCount(file: string): Promise<number> {
  try {
    if ((await fsp.stat(file)).size > COUNT_MAX) return 0
    const txt = await fsp.readFile(file, 'utf8')
    return txt ? txt.split('\n').length - (txt.endsWith('\n') ? 1 : 0) : 0
  } catch {
    return 0
  }
}

/** "## main...origin/main [ahead 1]" -> "main"; detached is "HEAD", as rev-parse says. */
function branchOf(header: string) {
  const h = header.replace(/^## /, '')
  if (h.startsWith('HEAD (no branch)')) return 'HEAD'
  return h.replace(/^No commits yet on /, '').replace(/^Initial commit on /, '').split('...')[0]!.split(' ')[0]!
}

export async function status(cwd: string): Promise<GitStatus> {
  try {
    // Two git runs: status with the branch header, and staged plus unstaged line counts against HEAD.
    const [porcelain, numstat] = await Promise.all([
      git(cwd, ['status', '--porcelain=v1', '-b', '-uall']),
      git(cwd, ['diff', 'HEAD', '--numstat']).catch(() => git(cwd, ['diff', '--cached', '--numstat']).catch(() => '')),
    ])
    const ns = parseNumstat(numstat)
    const changes: GitChange[] = []
    const lines = porcelain.split('\n')
    const branch = lines[0]?.startsWith('## ') ? branchOf(lines.shift()!) : ''
    const counts: Promise<void>[] = []
    for (const line of lines) {
      if (line.length < 4) continue
      const x = line[0]!, y = line[1]!
      let p = line.slice(3)
      if (p.includes(' -> ')) p = p.split(' -> ').pop()!
      p = p.replace(/^"|"$/g, '')
      const untracked = x === '?'
      const st: GitChange['st'] = untracked || x === 'A' ? 'A' : x === 'D' || y === 'D' ? 'D' : 'M'
      const c: GitChange = { p, st, a: ns.get(p)?.a || 0, d: ns.get(p)?.d || 0, staged: x !== ' ' && x !== '?' && y === ' ' }
      changes.push(c)
      // Untracked files have no diff; their lines are counted from the file.
      if (untracked && counts.length < COUNT_FILES) counts.push(lineCount(path.join(cwd, p)).then((n) => { c.a = n }))
    }
    await Promise.all(counts)
    return { isRepo: true, branch, changes }
  } catch {
    return { isRepo: false, branch: '', changes: [] }
  }
}

/** Tracked plus untracked files, honouring .gitignore. */
export async function files(cwd: string): Promise<string[]> {
  try {
    const out = await git(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    return [...new Set(out.split('\0').filter(Boolean))].sort()
  } catch {
    return []
  }
}

export async function diff(cwd: string, file: string): Promise<string> {
  try {
    const out = await git(cwd, ['diff', 'HEAD', '--no-color', '-U3', '--', file])
    if (out.trim()) return out
  } catch {
    // Fall through: new repo without HEAD, or untracked file.
  }
  try {
    // Exits 1 when the files differ, which is always the case here.
    return await git(cwd, ['diff', '--no-color', '--no-index', '--', '/dev/null', file], [0, 1])
  } catch {
    return ''
  }
}

export function readFile(cwd: string, file: string): string {
  const full = path.join(cwd, file)
  try {
    const st = fs.statSync(full)
    if (st.size > 1024 * 1024) return `File is too large to preview (${Math.round(st.size / 1024)} KB).`
    const buf = fs.readFileSync(full)
    if (buf.subarray(0, 8000).includes(0)) return 'Binary file.'
    return buf.toString('utf8')
  } catch {
    return ''
  }
}

export async function worktreeAdd(repo: string, base: string, slug: string): Promise<{ path: string; branch: string }> {
  const wtPath = `${repo}.worktrees${path.sep}${slug}`
  const branch = `wt/${slug}`
  await git(repo, ['worktree', 'add', '-b', branch, wtPath, base || 'HEAD'])
  return { path: wtPath, branch }
}

/** Merges the worktree branch into base in the main folder, then removes the worktree. */
export async function mergeWorktree(repo: string, wtPath: string, branch: string, base: string): Promise<void> {
  const cur = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  if (cur !== base) await git(repo, ['checkout', base])
  await git(repo, ['merge', '--no-edit', branch])
  await git(repo, ['worktree', 'remove', '--force', wtPath])
  await git(repo, ['branch', '-d', branch]).catch(() => undefined)
}

// ---------- Actions from the explorer: stage, commit, push, pull request ----------

export type GitResult = { ok: boolean; error?: string }

async function attempt(fn: () => Promise<unknown>): Promise<GitResult> {
  try {
    await fn()
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

export function stage(cwd: string, paths: string[]): Promise<GitResult> {
  return attempt(() => git(cwd, ['add', '-A', '--', ...paths]))
}

export function unstage(cwd: string, paths: string[]): Promise<GitResult> {
  // A repo without commits has no HEAD to restore from; dropping the paths from the index does the same.
  return attempt(() => git(cwd, ['restore', '--staged', '--', ...paths]).catch(() => git(cwd, ['rm', '-r', '--cached', '-q', '--', ...paths])))
}

export function commit(cwd: string, message: string, all: boolean): Promise<GitResult> {
  return attempt(async () => {
    if (all) await git(cwd, ['add', '-A'])
    // Passed through a file so multi-line messages and quotes survive Windows argument rules.
    const file = path.join(cwd, '.git', 'CANOPY_COMMIT_MSG')
    fs.writeFileSync(file, message)
    try {
      await git(cwd, ['commit', '-F', file])
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
}

export interface SyncInfo {
  branch: string
  upstream: string
  ahead: number
  behind: number
  remote: string
}

export async function syncInfo(cwd: string): Promise<SyncInfo> {
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')).trim()
  const upstream = (await git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')).trim()
  const remote = (await git(cwd, ['remote', 'get-url', 'origin']).catch(() => '')).trim()
  let ahead = 0, behind = 0
  if (upstream) {
    const out = (await git(cwd, ['rev-list', '--left-right', '--count', '@{u}...HEAD']).catch(() => '0\t0')).trim().split(/\s+/)
    behind = +out[0]! || 0
    ahead = +out[1]! || 0
  } else if (branch && branch !== 'HEAD') {
    // Not pushed yet: everything on the branch counts as ahead.
    ahead = +(await git(cwd, ['rev-list', '--count', 'HEAD']).catch(() => '0')).trim() || 0
  }
  return { branch, upstream, ahead, behind, remote }
}

export function push(cwd: string): Promise<GitResult> {
  return attempt(async () => {
    const upstream = (await git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).catch(() => '')).trim()
    if (upstream) await git(cwd, ['push'])
    else await git(cwd, ['push', '-u', 'origin', 'HEAD'])
  })
}

/** The web page for opening a pull (or merge) request from the current branch, worked out from the origin URL. */
export async function pullRequestUrl(cwd: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { branch, remote } = await syncInfo(cwd)
  if (!remote) return { ok: false, error: 'This repo has no origin remote.' }
  if (!branch || branch === 'HEAD') return { ok: false, error: 'Check out a branch first.' }
  // git@host-alias:owner/repo.git, ssh://git@host/owner/repo.git or https://host/owner/repo(.git)
  const m = remote.match(/^(?:[\w.-]+@)?([^:/]+)[:/](.+?)(?:\.git)?\/?$/) || remote.match(/^\w+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/)
  if (!m) return { ok: false, error: `Can't read the origin URL (${remote}).` }
  const hostRaw = m[1]!.toLowerCase(), repo = m[2]!.replace(/^\/+/, '')
  // SSH host aliases such as "github-work" still point at the real host.
  const host = /github/.test(hostRaw) ? 'github.com' : /gitlab/.test(hostRaw) ? 'gitlab.com' : /bitbucket/.test(hostRaw) ? 'bitbucket.org' : hostRaw
  const b = encodeURIComponent(branch)
  if (host.includes('gitlab')) return { ok: true, url: `https://${host}/${repo}/-/merge_requests/new?merge_request[source_branch]=${b}` }
  if (host.includes('bitbucket')) return { ok: true, url: `https://${host}/${repo}/pull-requests/new?source=${b}` }
  return { ok: true, url: `https://${host}/${repo}/compare/${b}?expand=1` }
}

/** What a commit message is written from: the staged diff, or everything when nothing is staged. */
export async function diffForMessage(cwd: string): Promise<string> {
  const staged = (await git(cwd, ['diff', '--cached', '--stat']).catch(() => '')).trim()
  const args = staged ? ['diff', '--cached', '--no-color', '-U2'] : ['diff', 'HEAD', '--no-color', '-U2']
  const stat = staged || (await git(cwd, ['diff', 'HEAD', '--stat']).catch(() => '')).trim()
  const body = await git(cwd, args).catch(() => '')
  const untracked = staged ? '' : (await git(cwd, ['ls-files', '--others', '--exclude-standard']).catch(() => '')).trim()
  const LIMIT = 24_000
  return [stat, untracked ? `New files:\n${untracked}` : '', body.length > LIMIT ? body.slice(0, LIMIT) + '\n[diff truncated]' : body].filter(Boolean).join('\n\n')
}

/** Commits made in a time window, for the daily summary. */
export async function commitsBetween(cwd: string, since: number, until: number): Promise<{ hash: string; subject: string; files: number; ins: number; del: number; at: number }[]> {
  const out = await git(cwd, ['log', '--all', `--since=${new Date(since).toISOString()}`, `--until=${new Date(until).toISOString()}`, '--no-merges', '--shortstat', '--pretty=format:%x1e%h%x1f%ct%x1f%s']).catch(() => '')
  return out.split('\x1e').filter(s => s.trim()).map((chunk) => {
    const [head, ...rest] = chunk.split('\n')
    const [hash, ct, subject] = head!.split('\x1f')
    const stat = rest.join(' ')
    return {
      hash: hash!, subject: subject || '', at: (+ct! || 0) * 1000,
      files: +(stat.match(/(\d+) files? changed/)?.[1] || 0),
      ins: +(stat.match(/(\d+) insertions?/)?.[1] || 0),
      del: +(stat.match(/(\d+) deletions?/)?.[1] || 0),
    }
  })
}
