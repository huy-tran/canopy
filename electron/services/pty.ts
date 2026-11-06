// Claude Code terminals and plain shells. One node-pty per session, streamed to the renderer.
import * as pty from 'node-pty'
import fs from 'node:fs'
import os from 'node:os'
import type { ShellInfo, ShellKind } from '../../shared/types'
import { writeSessionSettings, removeSessionSettings } from './hooks'
import { commandLine, IS_WIN } from './shellcmd'

export interface SpawnOpts {
  id: string
  cwd: string
  cmd: string
  cols: number
  rows: number
}

interface Term {
  p: pty.IPty
  /** Recent output, replayed when the renderer attaches. */
  buf: string
  /** Output not yet sent to the renderer. */
  pending: string
  flushT?: ReturnType<typeof setTimeout>
}

const terms = new Map<string, Term>()

/** Windows ptys go through ConPTY; node-pty has no such option elsewhere. */
export const CONPTY = IS_WIN ? { useConpty: true } : {}

/** Characters of recent output kept per terminal for replay (about 2 MB). */
const REPLAY_MAX = 1_000_000
/** ConPTY emits many small chunks; send them on together, at most this often. */
const FLUSH_MS = 8
const FLUSH_NOW = 64 * 1024

export function liveCount() {
  return terms.size
}

/** The app's environment minus Claude Code's own session variables, so each terminal starts a fresh top-level session. */
export function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v == null || /^(CLAUDECODE|CLAUDE_CODE_)/i.test(k) || k === 'ELECTRON_RUN_AS_NODE' || k === 'CANOPY_DEV_URL') continue
    env[k] = v
  }
  return env
}

/** Adds `--settings` so our hooks run, when the startup command launches claude. */
export function withHooks(cmd: string, settingsFile: string): string {
  const first = cmd.trim().split(/\s+/)[0] || ''
  if (!/(^|[\\/])claude(\.cmd|\.exe|\.ps1)?$/i.test(first)) return cmd
  return `${cmd} --settings "${settingsFile}"`
}

export function spawnSession(o: SpawnOpts, onData: (id: string, d: string) => void, onExit: (id: string, code: number) => void) {
  killSession(o.id)
  const settings = writeSessionSettings(o.id)
  const full = withHooks(o.cmd || 'claude', settings)
  // `o.cmd` is the command the user set for the project (Settings > Projects) and runs as typed, in cmd.exe or the user's shell: only the app's own window can send it (see trusted() in main.ts).
  const sh = commandLine(full)
  const p = pty.spawn(sh.file, sh.args, {
    name: 'xterm-256color',
    cols: Math.max(20, o.cols || 120),
    rows: Math.max(5, o.rows || 30),
    cwd: o.cwd,
    env: { ...cleanEnv(), CANOPY_SESSION: o.id, FORCE_COLOR: '1', COLORTERM: 'truecolor' },
    ...CONPTY,
  })
  return track(o.id, p, onData, (id, code) => {
    removeSessionSettings(id)
    onExit(id, code)
  })
}

/** Registers a pty under an id, keeping recent output for replay and streaming it on. */
function track(id: string, p: pty.IPty, onData: (id: string, d: string) => void, onExit: (id: string, code: number) => void) {
  const t: Term = { p, buf: '', pending: '' }
  terms.set(id, t)
  const flush = () => {
    clearTimeout(t.flushT)
    t.flushT = undefined
    if (!t.pending) return
    const d = t.pending
    t.pending = ''
    onData(id, d)
  }
  p.onData((d) => {
    t.buf += d
    // Trimmed in big steps so the copy is rare, and at a line break so no escape sequence is cut in half.
    if (t.buf.length > REPLAY_MAX * 1.5) t.buf = t.buf.slice(t.buf.indexOf('\n', t.buf.length - REPLAY_MAX) + 1)
    t.pending += d
    if (t.pending.length >= FLUSH_NOW) flush()
    else if (!t.flushT) t.flushT = setTimeout(flush, FLUSH_MS)
  })
  p.onExit(({ exitCode }) => {
    flush()
    if (terms.get(id) === t) terms.delete(id)
    onExit(id, exitCode)
  })
  return { pid: p.pid }
}

/** A one-off command line in a pty, such as an AWS CLI session; its window closes with it. */
export function spawnCommand(o: { id: string; cmd: string; cols: number; rows: number }, onData: (id: string, d: string) => void, onExit: (id: string, code: number) => void) {
  killSession(o.id)
  const sh = commandLine(o.cmd)
  const p = pty.spawn(sh.file, sh.args, {
    name: 'xterm-256color',
    cols: Math.max(20, o.cols || 120),
    rows: Math.max(5, o.rows || 30),
    cwd: os.homedir(),
    env: { ...cleanEnv(), COLORTERM: 'truecolor' },
    ...CONPTY,
  })
  return track(o.id, p, onData, onExit)
}

/** Arguments for an interactive shell that starts in the spawn folder. */
function shellArgs(kind: ShellKind): string[] {
  if (kind === 'gitbash') return ['--login', '-i']
  if (kind === 'pwsh' || kind === 'powershell') return ['-NoLogo']
  return []
}

/** A plain shell (no Claude, no hooks) in a pty. */
export function spawnShell(o: { id: string; cwd: string; shell: ShellInfo; cols: number; rows: number }, onData: (id: string, d: string) => void, onExit: (id: string, code: number) => void) {
  killSession(o.id)
  const p = pty.spawn(o.shell.exe, shellArgs(o.shell.kind), {
    name: 'xterm-256color',
    cols: Math.max(20, o.cols || 120),
    rows: Math.max(5, o.rows || 30),
    cwd: o.cwd,
    // CHERE_INVOKING keeps Git Bash's login shell in the spawn folder instead of $HOME.
    env: { ...cleanEnv(), CHERE_INVOKING: '1', COLORTERM: 'truecolor' },
    ...CONPTY,
  })
  return track(o.id, p, onData, onExit)
}


/** The system ssh client in a pty. */
export function spawnSsh(o: { id: string; cwd: string; exe: string; args: string[]; password?: string; passwordKind?: 'password' | 'passphrase'; cols: number; rows: number }, onData: (id: string, d: string) => void, onExit: (id: string, code: number) => void) {
  killSession(o.id)
  const p = pty.spawn(o.exe, o.args, {
    name: 'xterm-256color',
    cols: Math.max(20, o.cols || 120),
    rows: Math.max(5, o.rows || 30),
    // ssh does not need a project folder, so one that is missing (moved, deleted) falls back to home instead of failing to start.
    cwd: fs.existsSync(o.cwd) ? o.cwd : os.homedir(),
    env: { ...cleanEnv(), COLORTERM: 'truecolor' },
    ...CONPTY,
  })
  return track(o.id, p, o.password ? autoPassword(p, o.password, o.passwordKind || 'password', onData) : onData, onExit)
}

/** ssh's own prompts, as the whole last line: a password for the account, or a key's passphrase. */
const PASSWORD_PROMPT = /^(?:[^\s@]+@[^\s']+'s password|(?:\([^)\n]*\) )?Password): $/
const PASSPHRASE_PROMPT = /^Enter passphrase for key '[^'\n]+': $/
/** The saved secret is only typed during sign-in, never into whatever runs on the server afterwards. */
const AUTOFILL_MS = 30_000

/**
 * Answers ssh's own sign-in prompt with the saved secret: only the prompt that fits the method (a password, or a key's passphrase),
 * only in the first seconds, and at most twice so a wrong one never locks the account.
 */
function autoPassword(p: pty.IPty, secret: string, kind: 'password' | 'passphrase', onData: (id: string, d: string) => void) {
  const prompt = kind === 'passphrase' ? PASSPHRASE_PROMPT : PASSWORD_PROMPT
  const until = Date.now() + AUTOFILL_MS
  let tail = '', sent = 0
  return (id: string, d: string) => {
    onData(id, d)
    if (sent >= 2 || Date.now() > until) return
    // eslint-disable-next-line no-control-regex
    tail = (tail + d).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').slice(-300)
    const last = tail.slice(Math.max(tail.lastIndexOf('\n'), tail.lastIndexOf('\r')) + 1)
    if (prompt.test(last)) {
      sent++
      tail = ''
      p.write(secret + '\r')
    }
  }
}

export function writeSession(id: string, data: string) {
  terms.get(id)?.p.write(data)
}

export function resizeSession(id: string, cols: number, rows: number) {
  const t = terms.get(id)
  if (!t || cols < 2 || rows < 2) return
  try {
    t.p.resize(cols, rows)
  } catch {
    // The process may have just exited.
  }
}

export function killSession(id: string) {
  const t = terms.get(id)
  if (!t) return
  terms.delete(id)
  clearTimeout(t.flushT)
  try {
    t.p.kill()
  } catch {
    // Already exited.
  }
  removeSessionSettings(id)
}

export function killAllSessions() {
  for (const id of [...terms.keys()]) killSession(id)
}

export function bufferOf(id: string): string {
  return terms.get(id)?.buf ?? ''
}
