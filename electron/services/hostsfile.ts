// Reads hosts from a file the user picks: a CSV export (Termius and others) or an OpenSSH config file.
import type { SshHost } from '../../shared/types'

const HOSTNAME = /^[A-Za-z0-9][A-Za-z0-9._:%\-[\]]*$/
const USER = /^[A-Za-z0-9_][A-Za-z0-9._\-@]*$/
/** A key path: no leading dash and no control characters. It reaches ssh as its own argument after -i, never through a shell. */
const keyOk = (k: string | undefined) => (k && !k.startsWith('-') && !/[\x00-\x1f]/.test(k) ? k : undefined)

export interface HostsFileResult {
  hosts: Omit<SshHost, 'id'>[]
  /** Rows or entries with no usable host. */
  skipped: number
}

/** CSV with quoted fields, doubled quotes and commas or newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

const COLUMNS: Record<string, string[]> = {
  group: ['group', 'groups', 'folder'],
  name: ['label', 'name', 'title', 'alias'],
  host: ['hostname/ip', 'hostname', 'host', 'address', 'ip', 'server'],
  port: ['port'],
  user: ['username', 'user', 'login'],
  key: ['ssh key', 'key', 'identity', 'identityfile', 'private key'],
  protocol: ['protocol'],
}

/** A CSV whose first row names the columns. Passwords are deliberately not read. */
export function parseHostsCsv(text: string): HostsFileResult {
  const rows = parseCsv(text)
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase())
  const at = (k: string) => head.findIndex(h => COLUMNS[k]!.includes(h))
  const col = { group: at('group'), name: at('name'), host: at('host'), port: at('port'), user: at('user'), key: at('key'), protocol: at('protocol') }
  const out: HostsFileResult = { hosts: [], skipped: 0 }
  if (col.host < 0) return { hosts: [], skipped: rows.length }
  const get = (r: string[], i: number) => (i < 0 ? '' : (r[i] || '').trim())
  for (const r of rows) {
    let host = get(r, col.host), user = get(r, col.user) || undefined
    const at = host.lastIndexOf('@')
    if (at > 0) {
      user = user || host.slice(0, at)
      host = host.slice(at + 1)
    }
    const proto = get(r, col.protocol).toLowerCase()
    if (!HOSTNAME.test(host) || (proto && proto !== 'ssh') || (user && !USER.test(user))) {
      out.skipped++
      continue
    }
    const port = Number(get(r, col.port))
    const key = get(r, col.key)
    const usable = !/\.ppk$/i.test(key) && /[\\/]/.test(key) ? keyOk(key) : undefined
    // Termius can nest groups as "A/B": keep the last part.
    const group = get(r, col.group).split(/[/>]/).pop()?.trim() || undefined
    out.hosts.push({
      name: get(r, col.name) || host,
      host,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 22,
      user,
      auth: usable ? 'key' : 'auto',
      identity: usable,
      group,
    })
  }
  return out
}

/** An OpenSSH config file: each named Host block with its HostName, User, Port and IdentityFile. */
export function parseHostsConfig(text: string): HostsFileResult {
  const out: HostsFileResult = { hosts: [], skipped: 0 }
  type Block = { aliases: string[]; v: Record<string, string> }
  const blocks: Block[] = []
  let cur: Block | null = null
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z]+)\s*[=\s]\s*(.+?)\s*$/.exec(raw.replace(/#.*$/, ''))
    if (!m) continue
    const k = m[1]!.toLowerCase(), v = m[2]!.replace(/^"|"$/g, '')
    if (k === 'host') blocks.push((cur = { aliases: v.split(/\s+/), v: {} }))
    else if (k === 'match') cur = null
    else if (cur && !(k in cur.v)) cur.v[k] = v
  }
  const seen = new Set<string>()
  for (const b of blocks) {
    for (const alias of b.aliases) {
      if (!alias || /[*?!]/.test(alias) || seen.has(alias)) continue
      seen.add(alias)
      const host = b.v.hostname || alias, user = b.v.user, port = Number(b.v.port), key = keyOk(b.v.identityfile)
      if (!HOSTNAME.test(host) || (user && !USER.test(user))) {
        out.skipped++
        continue
      }
      out.hosts.push({
        name: alias,
        host,
        port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 22,
        user,
        auth: key ? 'key' : 'auto',
        identity: key,
        group: 'Imported',
      })
    }
  }
  return out
}

/** CSV when the name says so or the first line has commas but no "Host" keyword, otherwise an ssh config. */
export function parseHostsFile(name: string, text: string): HostsFileResult {
  const csv = /\.csv$/i.test(name) || (!/^\s*Host\s/im.test(text) && text.split(/\r?\n/, 1)[0]!.includes(','))
  return csv ? parseHostsCsv(text) : parseHostsConfig(text)
}
