// Canopy's own resource use: memory and CPU per process, main-thread lag and terminal traffic.
import { app } from 'electron'
import os from 'node:os'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import type { AppMetrics } from '../../shared/types'
import { liveCount } from './pty'

const RESOLUTION = 20
const lag = monitorEventLoopDelay({ resolution: RESOLUTION })
lag.enable()
/** Windows wakes timers on a ~15.6ms tick, so an idle loop always looks that late; only delay beyond it counts. */
const SLOP = process.platform === 'win32' ? 16 : 1
const lateBy = (ns: number) => (Number.isFinite(ns) ? Math.max(0, ns / 1e6 - RESOLUTION - SLOP) : 0)
let elu = performance.eventLoopUtilization()

let ptyBytes = 0
let ipcCount = 0
let lastAt = Date.now()

export function countPty(bytes: number) {
  ptyBytes += bytes
}

export function countIpc() {
  ipcCount++
}

const NAMES: Record<string, string> = { Browser: 'Main', Tab: 'Window', GPU: 'GPU', Utility: 'Utility', Zygote: 'Zygote' }

export function sampleMetrics(): AppMetrics {
  const now = Date.now()
  const secs = Math.max(0.25, (now - lastAt) / 1000)
  const procs = app.getAppMetrics().map(m => ({
    type: NAMES[m.type] || m.type,
    name: m.name || m.serviceName,
    memMB: (m.memory.workingSetSize || 0) / 1024,
    // percentCPUUsage is per core.
    cpu: m.cpu.percentCPUUsage || 0,
  }))
  const out: AppMetrics = {
    at: now,
    memMB: procs.reduce((a, p) => a + p.memMB, 0),
    cpu: procs.reduce((a, p) => a + p.cpu, 0) / Math.max(1, os.cpus().length),
    procs,
    busy: performance.eventLoopUtilization(elu).utilization * 100,
    lagMs: lateBy(lag.mean),
    lagMaxMs: lateBy(lag.max),
    ptys: liveCount(),
    ptyKBps: ptyBytes / 1024 / secs,
    ipcPerSec: ipcCount / secs,
  }
  lag.reset()
  elu = performance.eventLoopUtilization()
  ptyBytes = 0
  ipcCount = 0
  lastAt = now
  return out
}
