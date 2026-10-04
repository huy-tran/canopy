import { defineStore } from 'pinia'
import type { Project, Repo, Service } from '#shared/types'

export type SvcStatus = 'starting' | 'running' | 'stopped'
export interface LogLine { t: string; c: string }

const MAX_LINES = 1000

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-Z\\-_]/g

// eslint-disable-next-line no-control-regex
const CURSOR_MOVE = /\x1b\[\d+;\d+[Hf]|\x1b\[\d*E/g

/** Colour class for a log line, matching how the prototype tinted server output. */
function tint(t: string): string {
  if (/\b(ERROR|Error|error|FAIL|failed|Exception)\b|\s(4\d\d|5\d\d)\s/.test(t)) return 'red'
  if (/\b(WARN|WARNING|warn|deprecated)\b|RUNNING/.test(t)) return 'amb'
  if (/\bINFO\b/.test(t)) return 'blue'
  if (/(✓|✔|DONE|ready in|Ready in|\bready\b|PASS)/.test(t)) return 'grn'
  if (/(Local:|➜|http:\/\/localhost)/.test(t)) return 'tx'
  return 'tx3'
}

export const useServicesStore = defineStore('services', () => {
  const runtime = ref<Record<string, { status: SvcStatus; log: LogLine[]; partial: string }>>({})

  function rt(id: string) {
    return runtime.value[id] || { status: 'stopped' as SvcStatus, log: [], partial: '' }
  }

  function status(id: string): SvcStatus {
    return runtime.value[id]?.status || 'stopped'
  }

  function push(id: string, lines: LogLine[]) {
    const r = rt(id)
    runtime.value = { ...runtime.value, [id]: { ...r, log: [...r.log, ...lines].slice(-MAX_LINES) } }
  }

  function onData(id: string, d: string) {
    const r = rt(id)
    // ConPTY sometimes positions the cursor instead of writing a newline; treat that as a line break.
    const text = (r.partial + d.replace(CURSOR_MOVE, '\n').replace(ANSI, '')).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    const parts = text.split('\n')
    const partial = parts.pop() || ''
    const lines = parts.map(t => t.replace(/^.*\r(?=.)/, '').replace(/\r/g, '')).map(t => ({ t, c: tint(t) }))
    runtime.value = { ...runtime.value, [id]: { ...r, partial, log: [...r.log, ...lines].slice(-MAX_LINES) } }
  }

  function onStatus(id: string, s: SvcStatus, code?: number) {
    const r = rt(id)
    const extra: LogLine[] = s === 'stopped' ? [...(r.partial ? [{ t: r.partial, c: tint(r.partial) }] : []), { t: code != null && code !== 0 && code !== 1 ? `Exited with code ${code}.` : 'Stopped.', c: 'fa' }] : []
    runtime.value = { ...runtime.value, [id]: { status: s, partial: s === 'stopped' ? '' : r.partial, log: [...r.log, ...extra].slice(-MAX_LINES) } }
  }

  /** Every service in a project, with the repo it belongs to. */
  function ofProject(p: Project | null): (Service & { repo: Repo })[] {
    return p ? p.repos.flatMap(r => (r.services || []).map(v => ({ ...v, repo: r }))) : []
  }

  function start(v: Service, r: Repo) {
    const st = status(v.id)
    if (st === 'running' || st === 'starting') return
    push(v.id, [{ t: '> ' + v.cmd, c: 'fa' }])
    runtime.value[v.id]!.status = 'starting'
    api.svc.start({ id: v.id, cwd: r.path, cmd: v.cmd, port: v.port })
  }

  function stop(id: string) {
    if (status(id) === 'stopped') return
    push(id, [{ t: '^C', c: 'fa' }])
    return api.svc.stop(id)
  }

  async function restart(v: Service, r: Repo) {
    await stop(v.id)
    start(v, r)
  }

  function clear(id: string) {
    const r = rt(id)
    runtime.value = { ...runtime.value, [id]: { ...r, log: [], partial: '' } }
  }

  function forget(id: string) {
    stop(id)
    const next = { ...runtime.value }
    delete next[id]
    runtime.value = next
  }

  function startProject(p: Project | null) {
    ofProject(p).forEach(v => start(v, v.repo))
  }

  function stopProject(p: Project | null) {
    ofProject(p).forEach(v => stop(v.id))
  }

  return { runtime, status, onData, onStatus, ofProject, start, stop, restart, clear, forget, startProject, stopProject }
})
