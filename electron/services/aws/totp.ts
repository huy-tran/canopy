// AWS behind a TOTP code, the same lock as aws-tui's: one secret and set of backup codes in
// ~/.aws-tui, and an unlock marker with its expiry, so unlocking either tool unlocks both.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import QRCode from 'qrcode'
import type { AwsEnrolment } from '../../../shared/aws'

const DIR = path.join(os.homedir(), '.aws-tui')
const SECRET = path.join(DIR, 'totp.secret')
const CODES = path.join(DIR, 'backup.codes')
const MARKER = path.join(DIR, 'unlock.marker')
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
/** Backup codes leave out the letters and digits that look alike, as aws-tui's do. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = B32.indexOf(ch)
    if (i < 0) continue
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

function base32Encode(b: Buffer): string {
  let bits = 0, value = 0, out = ''
  for (const byte of b) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

/** The 6-digit code for a 30-second step (RFC 6238, SHA-1). */
function codeAt(secret: string, step: number) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest()
  const o = h[h.length - 1]! & 0xf
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!
  return String(n % 1_000_000).padStart(6, '0')
}

/** Accepts the current code and the ones either side of it, for a clock a little off. */
function validCode(code: string, secret: string) {
  if (!/^\d{6}$/.test(code)) return false
  const step = Math.floor(Date.now() / 30_000)
  return [-1, 0, 1].some(d => crypto.timingSafeEqual(Buffer.from(codeAt(secret, step + d)), Buffer.from(code)))
}

const hashCode = (c: string) => 'sha256:' + crypto.createHash('sha256').update(c.trim().toUpperCase()).digest('hex')
const isBackupFormat = (s: string) => s.length === 11 && s[5] === '-'

function ensureDir() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 })
}

let checked = { at: 0, until: 0 }

/** When the current unlock runs out, or 0; read again at most every two seconds. */
export function unlockedUntil(): number {
  if (Date.now() - checked.at < 2000) return checked.until
  let until = 0
  try {
    until = new Date(fs.readFileSync(MARKER, 'utf8').trim()).getTime() || 0
  } catch {
    until = 0
  }
  checked = { at: Date.now(), until }
  return until
}

export const isUnlocked = () => unlockedUntil() > Date.now()

export const isEnrolled = () => fs.existsSync(SECRET)

function writeMarker(ttlHours: number) {
  ensureDir()
  const until = new Date(Date.now() + Math.max(0.25, ttlHours) * 3_600_000)
  fs.writeFileSync(MARKER, until.toISOString().replace(/\.\d{3}Z$/, 'Z'), { mode: 0o600 })
  checked = { at: 0, until: 0 }
}

/** Locks AWS again, here and in aws-tui. */
export function lock() {
  try {
    fs.rmSync(MARKER, { force: true })
  } catch {
    // Already gone.
  }
  checked = { at: 0, until: 0 }
}

// Wrong codes wait a little longer each time, as in aws-tui: 2s, doubling to 30s.
let backoff = 0
let nextTry = 0

/** Unlocks with a TOTP code or a one-time backup code. */
export function unlock(input: string, ttlHours: number): { ok: boolean; error?: string; waitMs?: number } {
  const now = Date.now()
  if (now < nextTry) return { ok: false, error: 'Too many wrong codes. Wait a moment.', waitMs: nextTry - now }
  const code = input.trim().replace(/\s/g, '')
  let ok = false
  if (isBackupFormat(code.toUpperCase())) {
    try {
      const hashes: string[] = JSON.parse(fs.readFileSync(CODES, 'utf8'))
      const i = hashes.indexOf(hashCode(code))
      if (i >= 0) {
        hashes.splice(i, 1)
        fs.writeFileSync(CODES, JSON.stringify(hashes), { mode: 0o600 })
        ok = true
      }
    } catch {
      ok = false
    }
  } else {
    try {
      ok = validCode(code, fs.readFileSync(SECRET, 'utf8').trim())
    } catch (e: any) {
      return { ok: false, error: `Could not read the TOTP secret: ${e?.message || e}` }
    }
  }
  if (!ok) {
    backoff = backoff ? Math.min(30_000, backoff * 2) : 2000
    nextTry = Date.now() + backoff
    return { ok: false, error: 'That code didn’t match.', waitMs: backoff }
  }
  backoff = 0
  nextTry = 0
  writeMarker(ttlHours)
  return { ok: true }
}

/** A secret being enrolled, kept until its first code is confirmed. */
let pending: string | null = null

/** Starts enrolment: a new secret, with its QR code for an authenticator app. */
export async function enrolStart(): Promise<AwsEnrolment> {
  pending = base32Encode(crypto.randomBytes(20))
  const account = `aws-tui:${os.userInfo().username}`
  const url = `otpauth://totp/${encodeURIComponent(`aws-tui:${account}`)}?secret=${pending}&issuer=aws-tui&algorithm=SHA1&digits=6&period=30`
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 })
  return { secret: pending, url, qr }
}

/** Confirms enrolment with a first code: saves the secret, unlocks, and returns ten one-time backup codes. */
export function enrolFinish(code: string, ttlHours: number): { ok: boolean; error?: string; codes?: string[] } {
  if (!pending) return { ok: false, error: 'Start again: the setup expired.' }
  if (!validCode(code.trim(), pending)) return { ok: false, error: 'That code didn’t match. Check the time on your phone and try again.' }
  ensureDir()
  fs.writeFileSync(SECRET, pending, { mode: 0o600 })
  const codes = Array.from({ length: 10 }, () => {
    const c = Array.from({ length: 10 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('')
    return `${c.slice(0, 5)}-${c.slice(5)}`
  })
  fs.writeFileSync(CODES, JSON.stringify(codes.map(hashCode)), { mode: 0o600 })
  pending = null
  writeMarker(ttlHours)
  return { ok: true, codes }
}
