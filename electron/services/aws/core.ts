// The AWS window's plumbing: profiles from ~/.aws, SDK clients per profile and region, a short-lived
// cache like aws-tui's, error sorting, the audit log, dry-run, and the state shared with aws-tui
// (last profile and regions, bookmarks, bucket regions). Every AWS call goes through `read` or
// `write`, which refuse while AWS is locked behind its TOTP code.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fromIni } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types'
import type { AwsBookmark, AwsCtx, AwsDone, AwsProblem, AwsProfile, AwsResult, AwsState } from '../../../shared/aws'
import { isUnlocked } from './totp'

/** aws-tui's own folder: the TOTP secret, unlock marker and audit log live here. */
export const TUI_DIR = path.join(os.homedir(), '.aws-tui')

/** Canopy's AWS settings, read from its saved prefs whenever they matter. */
export interface AwsSettings {
  totp: boolean
  ttlHours: number
  dryRun: boolean
}

let settingsOf: () => AwsSettings = () => ({ totp: true, ttlHours: 4, dryRun: false })

export function configureAws(get: () => AwsSettings) {
  settingsOf = get
}

export const settings = () => settingsOf()

/** Writes are only logged: Canopy's setting, or AWS_TUI_DRY_RUN set as for aws-tui. */
export function dryRunFrom(): 'setting' | 'env' | null {
  if (process.env.AWS_TUI_DRY_RUN !== undefined) return 'env'
  return settingsOf().dryRun ? 'setting' : null
}

// ---------- Profiles ----------

/** A small ini reader for ~/.aws/config and ~/.aws/credentials. */
function readIni(file: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return out
  }
  let cur: Record<string, string> | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const sec = line.match(/^\[(.+)\]$/)
    if (sec) {
      cur = out[sec[1]!.trim()] ||= {}
      continue
    }
    const kv = line.match(/^([^=]+?)\s*=\s*(.*)$/)
    if (kv && cur) cur[kv[1]!.trim()] = kv[2]!.trim()
  }
  return out
}

const awsDir = () => path.join(os.homedir(), '.aws')
const configFile = () => process.env.AWS_CONFIG_FILE || path.join(awsDir(), 'config')
const credentialsFile = () => process.env.AWS_SHARED_CREDENTIALS_FILE || path.join(awsDir(), 'credentials')

/** Every profile in ~/.aws/config and ~/.aws/credentials, by name, as aws-tui lists them. */
export function listProfiles(): AwsProfile[] {
  const byName = new Map<string, AwsProfile>()
  for (const [sec, v] of Object.entries(readIni(configFile()))) {
    const name = sec === 'default' ? 'default' : sec.startsWith('profile ') ? sec.slice(8).trim() : ''
    if (!name) continue
    const source = v.sso_start_url || v.sso_session ? 'sso' : v.role_arn ? 'assume-role' : 'unknown'
    byName.set(name, { name, region: v.region || '', source, ssoStartUrl: v.sso_start_url || '' })
  }
  for (const name of Object.keys(readIni(credentialsFile()))) {
    const p = byName.get(name)
    if (!p) byName.set(name, { name, region: '', source: 'static', ssoStartUrl: '' })
    else if (p.source === 'unknown') p.source = 'static'
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// ---------- Credentials and clients ----------

const creds = new Map<string, AwsCredentialIdentityProvider>()

/** One credential provider per profile, shared by its clients, refreshed a little before it runs out. */
function credsOf(profile: string): AwsCredentialIdentityProvider {
  let p = creds.get(profile)
  if (p) return p
  const base = fromIni({ profile })
  let held: AwsCredentialIdentity | null = null
  p = async () => {
    if (held && (!held.expiration || held.expiration.getTime() - Date.now() > 5 * 60_000)) return held
    held = await base()
    return held
  }
  creds.set(profile, p)
  return p
}

const clients = new Map<string, unknown>()

type ClientCtor<T> = new (o: { region: string; credentials: AwsCredentialIdentityProvider; maxAttempts?: number }) => T

/** An SDK client for a profile and region, made once and kept. */
export function client<T>(Ctor: ClientCtor<T>, ctx: AwsCtx, region = ctx.region): T {
  const k = `${Ctor.name}|${ctx.profile}|${region}`
  let c = clients.get(k) as T | undefined
  if (!c) {
    c = new Ctor({ region, credentials: credsOf(ctx.profile), maxAttempts: 3 })
    clients.set(k, c)
  }
  return c
}

/** Forgets a profile's credentials and clients, after its SSO sign-in ran out or was renewed. */
export function forgetProfile(profile: string) {
  creds.delete(profile)
  for (const k of [...clients.keys()]) if (k.split('|')[1] === profile) clients.delete(k)
}

// ---------- Errors ----------

/** Sorts an SDK error into what the window can say or do about it. */
export function problemOf(e: any): { error: string; problem: AwsProblem } {
  const name = String(e?.name || e?.Code || '')
  const msg = String(e?.message || e || 'Something went wrong.')
  const low = msg.toLowerCase()
  if (low.includes('token is expired') || low.includes('sso session') || (low.includes('ssooidc') && low.includes('expired')) || low.includes('aws sso login') || name === 'TokenProviderError') {
    return { error: msg, problem: 'sso' }
  }
  if (name === 'CredentialsProviderError' || low.includes('could not load credentials') || low.includes('unable to locate credentials') || /profile .* could not be found/.test(low)) {
    return { error: msg, problem: 'creds' }
  }
  if (/AccessDenied|UnauthorizedOperation|AuthorizationError|NotAuthorized|Forbidden/i.test(name) || low.includes('not authorized')) {
    return { error: msg, problem: 'denied' }
  }
  if (name === 'InvalidAccessException' && low.includes('securityhub')) {
    return { error: msg, problem: 'other' }
  }
  return { error: name && !msg.includes(name) && name !== 'Error' ? `${name}: ${msg}` : msg, problem: 'other' }
}

const LOCKED = { ok: false as const, error: 'AWS is locked. Enter your TOTP code to unlock it.', problem: 'locked' as const }

/** Whether AWS calls may go out: TOTP turned off, or unlocked recently enough. */
export function gateOpen() {
  return !settingsOf().totp || isUnlocked()
}

// ---------- The cache ----------

const cache = new Map<string, { v: unknown; exp: number; at: number }>()

/** Drops cached reads for a profile whose key starts with `prefix`, after a change. */
export function invalidate(ctx: AwsCtx, prefix: string) {
  const k0 = `${ctx.profile}|${prefix}`
  for (const k of [...cache.keys()]) if (k.startsWith(k0)) cache.delete(k)
}

/**
 * A read: from the cache while it is fresh (unless forced), else from AWS. `key` should say the
 * region where it matters, as aws-tui's cache keys do. A ttl of 0 never caches.
 */
export async function read<T>(ctx: AwsCtx, key: string, ttlMs: number, force: boolean, fn: () => Promise<T>): Promise<AwsResult<T>> {
  if (!gateOpen()) return LOCKED
  const k = `${ctx.profile}|${key}`
  const hit = cache.get(k)
  if (!force && hit && hit.exp > Date.now()) return { ok: true, data: hit.v as T, at: hit.at }
  try {
    const v = await fn()
    const at = Date.now()
    if (ttlMs > 0) cache.set(k, { v, exp: at + ttlMs, at })
    return { ok: true, data: v, at }
  } catch (e) {
    const p = problemOf(e)
    if (p.problem === 'sso' || p.problem === 'creds') forgetProfile(ctx.profile)
    return { ok: false, ...p }
  }
}

/** A plain call that is never cached, such as reading a parameter's value. */
export const fetchNow = <T>(ctx: AwsCtx, fn: () => Promise<T>) => read(ctx, '', 0, true, fn)

// ---------- Changes: audited, and only logged in dry-run ----------

/** Appends one line to ~/.aws-tui/audit.log, in aws-tui's format. Best effort. */
export function audit(ctx: AwsCtx, action: string, target: string, payload: Record<string, unknown> | undefined, dryRun: boolean, result: string) {
  try {
    fs.mkdirSync(TUI_DIR, { recursive: true, mode: 0o700 })
    const rec = { ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), profile: ctx.profile, region: ctx.region, action, target, ...(payload ? { payload } : {}), dry_run: dryRun, ...(result ? { result } : {}) }
    fs.appendFileSync(path.join(TUI_DIR, 'audit.log'), JSON.stringify(rec) + '\n', { mode: 0o600 })
  } catch {
    // Logging never stops the change.
  }
}

/**
 * A change to AWS: logged to the audit log, and in dry-run only logged. `fn` may return a result
 * worth keeping, such as the id of what it made.
 */
export async function write(ctx: AwsCtx, action: string, target: string, payload: Record<string, unknown> | undefined, fn: () => Promise<string | void>): Promise<AwsDone> {
  if (!gateOpen()) return LOCKED
  if (dryRunFrom()) {
    audit(ctx, action, target, payload, true, 'skipped')
    return { ok: true, dryRun: true }
  }
  try {
    const result = (await fn()) || ''
    audit(ctx, action, target, payload, false, result || 'ok')
    return { ok: true, result }
  } catch (e) {
    const p = problemOf(e)
    audit(ctx, action, target, payload, false, `error: ${p.error}`)
    return { ok: false, ...p }
  }
}

// ---------- State shared with aws-tui ----------

/** aws-tui's state.json: %APPDATA%\aws-tui on Windows, the XDG config folder elsewhere. */
function stateFile() {
  const base = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(base, 'aws-tui', 'state.json')
}

function readStateRaw(): Record<string, any> {
  try {
    const j = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

/** Writes the whole file again with these fields changed, keeping the ones Canopy doesn't use. */
function patchState(fn: (s: Record<string, any>) => void) {
  const s = readStateRaw()
  fn(s)
  s.updated_at = new Date().toISOString()
  const file = stateFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, file)
  } catch {
    // Remembering is a nicety; it never blocks the window.
  }
}

export function loadState(): AwsState {
  const s = readStateRaw()
  return { lastProfile: s.last_profile || '', lastRegions: s.last_regions || {}, bookmarks: s.bookmarks || {} }
}

export function rememberProfile(profile: string, region: string) {
  patchState((s) => {
    s.last_profile = profile
    if (region) s.last_regions = { ...(s.last_regions || {}), [profile]: region }
  })
}

export function saveBookmarks(profile: string, list: AwsBookmark[]) {
  patchState((s) => { s.bookmarks = { ...(s.bookmarks || {}), [profile]: list } })
}

export function bucketRegions(): Record<string, string> {
  return readStateRaw().bucket_regions || {}
}

export function saveBucketRegions(found: Record<string, string>) {
  if (!Object.keys(found).length) return
  patchState((s) => { s.bucket_regions = { ...(s.bucket_regions || {}), ...found } })
}

/** Runs `fn` over items, `limit` at a time. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k]!)
    }
  }))
  return out
}

/** A date from the SDK as epoch milliseconds, or 0. */
export const ms = (d: Date | string | number | undefined | null) => (d ? new Date(d).getTime() || 0 : 0)
