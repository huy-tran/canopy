import { defineStore } from 'pinia'
import type { AppMetrics } from '#shared/types'

/** Samples kept for sparklines: two minutes at one every 2s. */
const KEEP = 60
const EVERY = 2000

export interface MetricsSample {
  at: number
  memMB: number
  cpu: number
  fps: number
  lagMs: number
}

/**
 * Canopy's own performance, live: memory and CPU of every process, the window's frame rate,
 * long tasks that froze it, and how late the main process runs. Only measured while something
 * shows it (`use()` / `release()`) and the window is visible.
 */
export const useMetricsStore = defineStore('metrics', () => {
  const app = shallowRef<AppMetrics | null>(null)
  /** Frames the window drew per second. Idle windows draw at the display rate. */
  const fps = ref(0)
  /** Frame rate of the 3D World's render loop while it is open, else 0. */
  const sceneFps = ref(0)
  /** Tasks over 50ms that blocked the window, in the last sample, and the longest. */
  const longTasks = ref(0)
  const longestMs = ref(0)
  /** JavaScript heap of the window, in MB (Chromium only). */
  const heapMB = ref(0)
  const history = shallowRef<MetricsSample[]>([])

  let users = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let raf = 0
  let frames = 0
  let framesFrom = 0
  let observer: PerformanceObserver | undefined
  let tasks = 0
  let longest = 0

  const tick = () => {
    frames++
    raf = requestAnimationFrame(tick)
  }

  async function sample() {
    if (document.hidden) return
    const now = performance.now()
    fps.value = framesFrom ? Math.round((frames * 1000) / (now - framesFrom)) : 0
    frames = 0
    framesFrom = now
    longTasks.value = tasks
    longestMs.value = Math.round(longest)
    tasks = 0
    longest = 0
    const mem = (performance as any).memory
    if (mem) heapMB.value = mem.usedJSHeapSize / 1048576
    const m = await api.sys.metrics().catch(() => null)
    if (!m) return
    app.value = m
    const next = [...history.value, { at: m.at, memMB: m.memMB, cpu: m.cpu, fps: sceneFps.value || fps.value, lagMs: m.lagMs }]
    history.value = next.length > KEEP ? next.slice(-KEEP) : next
  }

  function start() {
    framesFrom = performance.now()
    frames = 0
    raf = requestAnimationFrame(tick)
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          tasks++
          longest = Math.max(longest, e.duration)
        }
      })
      observer.observe({ type: 'longtask', buffered: false })
    } catch {
      observer = undefined
    }
    sample()
    timer = setInterval(sample, EVERY)
  }

  function stop() {
    cancelAnimationFrame(raf)
    clearInterval(timer)
    observer?.disconnect()
    timer = undefined
    observer = undefined
  }

  /** Starts measuring for one more viewer. */
  function use() {
    if (users++ === 0) start()
  }

  function release() {
    if (users > 0 && --users === 0) stop()
  }

  return { app, fps, sceneFps, longTasks, longestMs, heapMB, history, use, release }
})
