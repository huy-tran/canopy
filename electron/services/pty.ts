// Claude Code terminals and plain shells. One node-pty per session, streamed to the renderer.
import * as pty from 'node-pty'
import os from 'node:os'
import type { ShellInfo, ShellKind } from '../../shared/types'
import { writeSessionSettings, removeSessionSettings } from './hooks'

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
  const shell = process.env.ComSpec || 'cmd.exe'
  // A raw command line: node-pty would otherwise re-escape the quotes inside `full` for cmd.
  const p = pty.spawn(shell, `/d /s /c "${full}"`, {
    name: 'xterm-256color',
    cols: Math.max(20, o.cols || 120),
    rows: Math.max(5, o.rows || 30),
    cwd: o.cwd,
    env: { ...cleanEnv(), CANOPY_SESSION: o.id, FORCE_COLOR: '1', COLORTERM: 'truecolor' },
    useConpty: true,
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
  const p = pty.spawn(process.env.ComSpec || 'cmd.exe', `/d /s /c "${o.cmd}"`, {
    name: 'xterm-256color',
    cols: Math.max(20, o.cols || 120),
    rows: Math.max(5, o.rows || 30),
    cwd: os.homedir(),
    env: { ...cleanEnv(), COLORTERM: 'truecolor' },
    useConpty: true,
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
    useConpty: true,
  })
  return track(o.id, p, onData, onExit)
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
