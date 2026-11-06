// Reads PuTTY's saved sessions for importing. On Windows they live in the registry (HKCU\Software\SimonTatham\PuTTY\Sessions),
// one key per session; on Linux and macOS they are files in ~/.putty/sessions.
import type { SshForward, SshHost } from '../../shared/types'

export type PuttySession = { name: string; values: Record<string, string> }

/** Sessions from the text of `reg query <Sessions key> /s`. */
export function parseRegQuery(text: string): PuttySession[] {
  const out: PuttySession[] = []
  let cur: PuttySession | null = null
  for (const raw of text.split(/\r?\n/)) {
    if (/^HKEY_/i.test(raw)) {
      const name = raw.slice(raw.lastIndexOf('\\') + 1).trim()
      cur = { name: safeDecode(name), values: {} }
      out.push(cur)
      continue
    }
    const m = /^\s+(\S+)\s+REG_[A-Z_]+\s*(.*)$/.exec(raw)
    if (!m || !cur) continue
    const v = m[2]!.trim()
    // DWORDs come out as 0x16.
    cur.values[m[1]!] = /^0x[0-9a-f]+$/i.test(v) ? String(parseInt(v, 16)) : v
  }
  return out
}

/** A session file from ~/.putty/sessions: Key=Value lines. */
export function parseSessionFile(name: string, text: string): PuttySession {
  const values: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) values[line.slice(0, i)] = line.slice(i + 1)
  }
  return { name: safeDecode(name), values }
}

/** PuTTY writes session names with %XX escapes. */
function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Port forwards as PuTTY keeps them: L8080=db:5432,R9000=localhost:3000,D1080. */
export function parseForwards(text: string | undefined): SshForward[] {
  const out: SshForward[] = []
  for (const part of (text || '').split(',')) {
    const m = /^([LRD])(?:([^:=]+):)?(\d+)(?:=([^:]+):(\d+))?$/.exec(part.trim())
    if (!m) continue
    const type = m[1] === 'L' ? 'local' : m[1] === 'R' ? 'remote' : 'dynamic'
    const bindPort = Number(m[3])
    if (type !== 'dynamic' && (!m[4] || !m[5])) continue
    out.push({ id: `f${out.length}${Math.random().toString(36).slice(2, 6)}`, type, bindHost: m[2] || undefined, bindPort, destHost: m[4] || undefined, destPort: m[5] ? Number(m[5]) : undefined })
  }
  return out
}

export interface PuttyMapped {
  hosts: Omit<SshHost, 'id'>[]
  /** Sessions that are not SSH, or have no host. */
  skipped: number
  /** Sessions whose key is a PuTTY .ppk file, which OpenSSH cannot read: the key is left out. */
  ppk: number
}

/** PuTTY's SSH sessions as Canopy connections, all in the "PuTTY" group (PuTTY has none of its own). */
export function mapPutty(sessions: PuttySession[]): PuttyMapped {
  const out: PuttyMapped = { hosts: [], skipped: 0, ppk: 0 }
  for (const s of sessions) {
    if (s.name === 'Default Settings') continue
    const v = s.values
    const protocol = (v.Protocol || 'ssh').toLowerCase()
    let host = (v.HostName || '').trim()
    let user = (v.UserName || '').trim() || undefined
    // PuTTY lets the host box hold user@host.
    const at = host.lastIndexOf('@')
    if (at > 0) {
      user = user || host.slice(0, at)
      host = host.slice(at + 1)
    }
    if (protocol !== 'ssh' || !host) {
      out.skipped++
      continue
    }
    const key = (v.PublicKeyFile || '').trim()
    const isPpk = /\.ppk$/i.test(key)
    if (isPpk) out.ppk++
    const port = Number(v.PortNumber)
    const forwards = parseForwards(v.PortForwardings)
    out.hosts.push({
      name: s.name,
      host,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 22,
      user,
      auth: key && !isPpk ? 'key' : 'auto',
      identity: key && !isPpk ? key : undefined,
      group: 'PuTTY',
      forwards: forwards.length ? forwards : undefined,
    })
  }
  return out
}
