// Reads Tabby's config for importing: its SSH profiles, groups and saved passwords. Tabby may lock the whole
// config with a vault passphrase (config.yaml then holds only the encrypted vault), so this can decrypt it.
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import type { SshAuth, SshForward, SshHost } from '../../shared/types'

const pbkdf2 = promisify(crypto.pbkdf2)

export interface TabbyVault {
  version?: number
  /** Base64 of the AES-256-CBC ciphertext. */
  contents: string
  /** Hex. */
  keySalt: string
  /** Hex. */
  iv: string
}

export interface TabbySecret {
  type?: string
  key?: { user?: string; host?: string; port?: number }
  value?: string
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** How the key may have been made from the passphrase: Tabby's PBKDF2 settings, then the likeliest alternatives. */
const KDFS: [number, string][] = [[100000, 'sha512'], [100000, 'sha256'], [10000, 'sha512']]

/** Decrypts a Tabby vault with its passphrase: the parsed JSON inside, or null when the passphrase is wrong. */
export async function decryptTabbyVault(v: TabbyVault, passphrase: string): Promise<unknown | null> {
  if (!v || typeof v.contents !== 'string' || typeof v.keySalt !== 'string' || typeof v.iv !== 'string') return null
  const data = Buffer.from(v.contents, 'base64')
  const iv = Buffer.from(v.iv, 'hex')
  for (const salt of [Buffer.from(v.keySalt, 'hex'), Buffer.from(v.keySalt, 'utf8')]) {
    for (const [iterations, digest] of KDFS) {
      try {
        const key = await pbkdf2(passphrase, salt, iterations, 32, digest)
        const d = crypto.createDecipheriv('aes-256-cbc', key, iv)
        return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'))
      } catch {
        // A wrong key, or another way of deriving it: try the next.
      }
    }
  }
  return null
}

/** The config and secrets inside a decrypted vault, whichever way Tabby nested them. */
export function configOfVault(plain: unknown): { config: Obj; secrets: TabbySecret[] } | null {
  if (!isObj(plain)) return null
  let config: unknown = plain.config
  if (isObj(config) && typeof config.content === 'string') config = config.content
  if (typeof config === 'string') {
    try {
      config = parse(config)
    } catch {
      return null
    }
  }
  if (!isObj(config) && Array.isArray(plain.profiles)) config = plain
  if (!isObj(config)) return null
  const secrets = Array.isArray(plain.secrets) ? plain.secrets : Array.isArray(config.secrets) ? config.secrets : []
  return { config, secrets: secrets as TabbySecret[] }
}

const AUTH: Record<string, SshAuth> = {
  password: 'password',
  publicKey: 'key',
  agent: 'agent',
  keyboardInteractive: 'interactive',
  'keyboard-interactive': 'interactive',
}

/** A key path as Tabby stores it: file://C:\Users\me\key.pem or a plain path. */
export function keyPath(p: unknown): string | undefined {
  if (typeof p !== 'string') return undefined
  const s = p.trim().replace(/^file:\/\//i, '').replace(/^\/(?=[A-Za-z]:)/, '')
  return s || undefined
}

const port = (n: unknown) => (Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) < 65536 ? Number(n) : undefined)
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

export interface TabbyMapped {
  hosts: (Omit<SshHost, 'id'> & { tabbyId: string })[]
  /** Saved passwords by the profile they belong to (its tabbyId). */
  passwords: Record<string, string>
  /** Profiles without a usable host. */
  skipped: number
}

/** Tabby's SSH profiles as Canopy connections, with their groups, jump hosts, port forwards and saved passwords. */
export function mapTabby(config: Obj, secrets: TabbySecret[] = []): TabbyMapped {
  const groups = new Map<string, string>()
  for (const g of Array.isArray(config.groups) ? config.groups : []) {
    if (isObj(g) && text(g.id) && text(g.name)) groups.set(String(g.id), String(g.name).trim())
  }
  const ssh = (Array.isArray(config.profiles) ? config.profiles : []).filter((p): p is Obj => isObj(p) && p.type === 'ssh' && isObj(p.options))
  const byId = new Map(ssh.map(p => [String(p.id), p]))
  const jumpOf = (id: unknown) => {
    const j = byId.get(String(id))
    const o = j && (j.options as Obj)
    const host = o && text(o.host)
    return host ? `${text(o.user) ? `${text(o.user)}@` : ''}${host}${port(o.port) && port(o.port) !== 22 ? `:${port(o.port)}` : ''}` : undefined
  }
  const out: TabbyMapped = { hosts: [], passwords: {}, skipped: 0 }
  for (const p of ssh) {
    const o = p.options as Obj
    const host = text(o.host)
    if (!host) {
      out.skipped++
      continue
    }
    const user = text(o.user)
    const forwards: SshForward[] = []
    for (const f of Array.isArray(o.forwardedPorts) ? o.forwardedPorts : []) {
      if (!isObj(f)) continue
      const type = String(f.type || '').toLowerCase()
      const bindPort = port(f.port)
      if (!bindPort || !['local', 'remote', 'dynamic'].includes(type)) continue
      const fw: SshForward = { id: `f${forwards.length}${Math.random().toString(36).slice(2, 6)}`, type: type as SshForward['type'], bindHost: text(f.host), bindPort }
      if (type !== 'dynamic') {
        if (!text(f.targetAddress) || !port(f.targetPort)) continue
        fw.destHost = text(f.targetAddress)
        fw.destPort = port(f.targetPort)
      }
      forwards.push(fw)
    }
    const keys = Array.isArray(o.privateKeys) ? o.privateKeys : []
    const auth = AUTH[String(o.auth)] || 'auto'
    const secret = secrets.find(s => s.type === 'ssh:password' && s.key?.host === host && (s.key?.user || undefined) === user && typeof s.value === 'string')
    const id = String(p.id)
    if (secret?.value) out.passwords[id] = secret.value
    out.hosts.push({
      tabbyId: id,
      name: text(p.name) || host,
      host,
      port: port(o.port) || 22,
      user,
      auth: secret?.value && auth === 'auto' ? 'password' : auth,
      identity: keyPath(keys[0]),
      jump: o.jumpHost ? jumpOf(o.jumpHost) : undefined,
      group: groups.get(String(p.group)) || undefined,
      forwards: forwards.length ? forwards : undefined,
    })
  }
  return out
}
