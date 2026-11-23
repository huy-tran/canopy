// Which of the gh CLI's signed-in accounts a GitHub call runs as. gh uses its active account unless told otherwise;
// with more than one account signed in, a repo is read and changed as the account that can reach it:
// the one its Canopy project names, else one already seen with it, else the first that can read it.
import { execFile } from 'node:child_process'
import os from 'node:os'
import type { GhAccounts } from '../../shared/types'

const isLogin = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(s)

/** Reads `gh auth status --json hosts`: the working github.com accounts, the active one first. */
export function parseAccounts(json: string): GhAccounts {
  try {
    const rows = (JSON.parse(json)?.hosts?.['github.com'] || []) as { login?: string; active?: boolean; state?: string }[]
    const good = rows.filter(r => isLogin(r.login) && (r.state === undefined || r.state === 'success'))
    const active = good.find(r => r.active)?.login || ''
    const list = [...new Set([...(active ? [active] : []), ...good.map(r => r.login!)])]
    return { list, active }
  } catch {
    return { list: [], active: '' }
  }
}

/**
 * The account for a repo. `explicit` is what its project asks for, `learned` what was seen to work before;
 * either only counts while that account is still signed in. '' means: leave it to gh's active account, or find out.
 */
export function pickAccount(repo: string, a: GhAccounts, explicit: Map<string, string>, learned: Map<string, string>): string {
  const key = repo.toLowerCase()
  for (const m of [explicit, learned]) {
    const login = m.get(key)
    if (login && a.list.includes(login)) return login
  }
  return ''
}

function gh(args: string[], env?: NodeJS.ProcessEnv, timeout = 15_000): Promise<{ out: string; err: Error | null }> {
  return new Promise((resolve) => {
    execFile('gh', args, { cwd: os.homedir(), windowsHide: true, encoding: 'utf8', timeout, env }, (err, stdout) => resolve({ out: stdout || '', err }))
  })
}

/** How long the list of accounts is trusted, so `gh auth switch` is noticed soon without asking before every call. */
const ACCOUNTS_MS = 15_000
/** How long a token read from gh is kept in memory. */
const TOKEN_MS = 10 * 60_000
/** How long "no account can read this repo" is believed before looking again. */
const MISS_MS = 5 * 60_000

let known: { at: number; value: Promise<GhAccounts> } | null = null
const tokens = new Map<string, { at: number; token: string }>()
const learned = new Map<string, string>()
const misses = new Map<string, number>()
const probing = new Map<string, Promise<string>>()
let explicit = new Map<string, string>()

/** The accounts gh is signed in with, asked again every few seconds. */
export function ghAccounts(): Promise<GhAccounts> {
  if (!known || Date.now() - known.at > ACCOUNTS_MS) {
    // gh exits with 1 when any account has a problem, and still prints the others.
    known = { at: Date.now(), value: gh(['auth', 'status', '--json', 'hosts']).then(r => parseAccounts(r.out)) }
  }
  return known.value
}

/** The accounts each repo's project asks for, by lowercase owner/name. */
export function setProjectAccounts(map: Map<string, string>) {
  explicit = map
}

/** Remembers that an account can reach a repo (it listed it, or a search under it returned it). */
export function learnAccount(repo: string, login: string) {
  if (login && repo) learned.set(repo.toLowerCase(), login)
}

async function tokenOf(login: string): Promise<string> {
  const had = tokens.get(login)
  if (had && Date.now() - had.at < TOKEN_MS) return had.token
  const r = await gh(['auth', 'token', '--user', login])
  const token = r.err ? '' : r.out.trim()
  if (token) tokens.set(login, { at: Date.now(), token })
  return token
}

/**
 * The environment that makes gh act as an account, or undefined to leave gh on its active one
 * (also when the account's token can't be read: the call then fails or succeeds as it always did).
 */
export async function envFor(login: string): Promise<NodeJS.ProcessEnv | undefined> {
  if (!login) return undefined
  const a = await ghAccounts()
  if (login === a.active || !a.list.includes(login)) return undefined
  const token = await tokenOf(login)
  return token ? { ...process.env, GH_TOKEN: token } : undefined
}

/** The account that can read a repo: the active one when it can, else the first other one that can. '' when none can, or there is only one. */
function probe(repo: string, a: GhAccounts): Promise<string> {
  const key = repo.toLowerCase()
  const missed = misses.get(key)
  if (missed && Date.now() - missed < MISS_MS) return Promise.resolve('')
  let p = probing.get(key)
  if (!p) {
    p = (async () => {
      for (const login of a.list) {
        const r = await gh(['api', `repos/${repo}`, '--jq', '.full_name'], await envFor(login))
        if (!r.err) {
          learned.set(key, login)
          return login
        }
      }
      misses.set(key, Date.now())
      return ''
    })().finally(() => probing.delete(key))
    probing.set(key, p)
  }
  return p
}

/** The account to use for a repo (owner/name), or '' for gh's active one. */
export async function accountFor(repo: string | null | undefined): Promise<string> {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return ''
  const a = await ghAccounts()
  if (a.list.length < 2) return ''
  return pickAccount(repo, a, explicit, learned) || probe(repo, a)
}

/** The login a call for this repo runs as: its account, else the active one. '' when gh can't say. */
export async function loginFor(repo: string | null | undefined): Promise<string> {
  return (await accountFor(repo)) || (await ghAccounts()).active
}

/** Forgets everything remembered, for tests. */
export function resetAccounts() {
  known = null
  tokens.clear()
  learned.clear()
  misses.clear()
  probing.clear()
  explicit = new Map()
}
