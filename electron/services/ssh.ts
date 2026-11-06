// SSH terminals: the system ssh client in a pty, with the connection's settings as plain arguments (never through a shell).
import os from 'node:os'
import type { SshForward, SshHost } from '../../shared/types'

const HOSTNAME = /^[A-Za-z0-9][A-Za-z0-9._:%\-[\]]*$/
const USER = /^[A-Za-z0-9_][A-Za-z0-9._\-@]*$/
const JUMP = /^[A-Za-z0-9_][A-Za-z0-9._\-@:,[\]%]*$/

function validPort(n: unknown) {
  return Number.isInteger(n) && (n as number) > 0 && (n as number) < 65536
}

/** The -L, -R or -D argument for one port forward. */
export function forwardArg(f: SshForward): string[] {
  if (!validPort(f.bindPort)) throw new Error('A port forward needs a listening port between 1 and 65535.')
  const bind = (f.bindHost || '').trim()
  if (bind && !HOSTNAME.test(bind) && bind !== '*') throw new Error('A port forward has an invalid listening address.')
  const from = bind ? `${bind}:${f.bindPort}` : String(f.bindPort)
  if (f.type === 'dynamic') return ['-D', from]
  const dest = (f.destHost || '').trim()
  if (!HOSTNAME.test(dest)) throw new Error('A port forward needs a destination host.')
  if (!validPort(f.destPort)) throw new Error('A port forward needs a destination port between 1 and 65535.')
  return [f.type === 'remote' ? '-R' : '-L', `${from}:${dest}:${f.destPort}`]
}

/** The arguments for `ssh` to open this connection, or an error naming what is wrong. */
export function sshArgs(h: SshHost, home = os.homedir()): string[] {
  const host = (h.host || '').trim(), user = (h.user || '').trim(), jump = (h.jump || '').trim()
  if (!HOSTNAME.test(host)) throw new Error('The host is missing or not valid.')
  if (user && !USER.test(user)) throw new Error('The user name is not valid.')
  if (jump && !JUMP.test(jump)) throw new Error('The jump host is not valid.')
  const port = h.port == null || (h.port as unknown) === '' ? 0 : Number(h.port)
  if (port && !validPort(port)) throw new Error('The port must be between 1 and 65535.')
  const args = ['-o', 'ServerAliveInterval=30']
  if (port) args.push('-p', String(port))
  const key = (h.identity || '').trim().replace(/^~(?=$|[\\/])/, home)
  if (h.auth === 'password') args.push('-o', 'PreferredAuthentications=password,keyboard-interactive', '-o', 'PubkeyAuthentication=no')
  else if (h.auth === 'interactive') args.push('-o', 'PreferredAuthentications=keyboard-interactive,password', '-o', 'PubkeyAuthentication=no')
  else if (h.auth === 'agent') args.push('-o', 'PreferredAuthentications=publickey')
  else if (h.auth === 'key') args.push('-o', 'IdentitiesOnly=yes')
  if (key && h.auth !== 'password' && h.auth !== 'agent' && h.auth !== 'interactive') args.push('-i', key)
  if (jump) args.push('-J', jump)
  for (const f of h.forwards || []) args.push(...forwardArg(f))
  const command = (h.command || '').trim()
  if (command) args.push('-t')
  args.push('--', user ? `${user}@${host}` : host)
  if (command) args.push(command)
  return args
}

/** Connections from the text of an ssh config: one per named Host, wildcard entries left out. ssh itself reads the rest from the config, so only the alias is kept. */
export function parseSshConfig(text: string): Omit<SshHost, 'id'>[] {
  const out: Omit<SshHost, 'id'>[] = []
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*Host\s+(.+?)\s*$/i.exec(raw.replace(/#.*$/, ''))
    if (!m) continue
    for (const alias of m[1]!.split(/\s+/)) {
      if (!alias || /[*?!]/.test(alias) || !HOSTNAME.test(alias) || seen.has(alias)) continue
      seen.add(alias)
      out.push({ name: alias, host: alias, group: 'ssh config' })
    }
  }
  return out
}
