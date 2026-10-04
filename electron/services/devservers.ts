// Dev servers (php artisan serve, npm run dev, ...) run in their own pty so tools keep colour and TTY behaviour.
import * as pty from 'node-pty'
import net from 'node:net'
import { execFile } from 'node:child_process'
import { cleanEnv } from './pty'

export type SvcStatus = 'starting' | 'running' | 'stopped'

interface Proc {
  p: pty.IPty
  status: SvcStatus
  probe?: NodeJS.Timeout
}

const procs = new Map<string, Proc>()

type Emit = {
  data: (id: string, d: string) => void
  status: (id: string, s: SvcStatus, code?: number) => void
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' })
    const done = (ok: boolean) => {
      s.destroy()
      resolve(ok)
    }
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
    s.setTimeout(400, () => done(false))
  })
}

export function startService(o: { id: string; cwd: string; cmd: string; port?: string }, emit: Emit) {
  const cur = procs.get(o.id)
  if (cur && cur.status !== 'stopped') return
  const shell = process.env.ComSpec || 'cmd.exe'
  const p = pty.spawn(shell, `/d /s /c "${o.cmd}"`, {
    name: 'xterm-256color', cols: 160, rows: 40, cwd: o.cwd,
    env: { ...cleanEnv(), FORCE_COLOR: '1' },
    useConpty: true,
  })
  const pr: Proc = { p, status: 'starting' }
  procs.set(o.id, pr)
  emit.status(o.id, 'starting')
  const port = parseInt(o.port || '', 10)
  const ready = () => {
    if (pr.status !== 'starting') return
    pr.status = 'running'
    if (pr.probe) clearInterval(pr.probe)
    emit.status(o.id, 'running')
  }
  if (port) {
    pr.probe = setInterval(async () => {
      if (await portOpen(port)) ready()
    }, 600)
  }
  p.onData((d) => {
    emit.data(o.id, d)
    if (!port) ready()
  })
  p.onExit(({ exitCode }) => {
    if (pr.probe) clearInterval(pr.probe)
    if (procs.get(o.id) === pr) {
      pr.status = 'stopped'
      emit.status(o.id, 'stopped', exitCode)
    }
  })
}

/** Kills the whole process tree, since cmd /c leaves php/node children behind otherwise. */
export function stopService(id: string): Promise<void> {
  const pr = procs.get(id)
  if (!pr || pr.status === 'stopped') return Promise.resolve()
  if (pr.probe) clearInterval(pr.probe)
  return new Promise((resolve) => {
    execFile('taskkill', ['/pid', String(pr.p.pid), '/T', '/F'], { windowsHide: true }, () => {
      try {
        pr.p.kill()
      } catch {
        // Already gone.
      }
      resolve()
    })
  })
}

export async function stopAllServices() {
  await Promise.all([...procs.keys()].map(stopService))
}
