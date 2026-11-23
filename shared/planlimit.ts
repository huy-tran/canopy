// When to warn that a Claude plan limit (5-hour or weekly) is running out.
import type { PlanUsage } from './types'

/** Percentages of a limit that each get one warning per window. */
export const LIMIT_STEPS = [80, 95]

export type LimitKey = 'five' | 'week'

/** What was last seen of each limit: the window it was in and the highest step already warned about. */
export type LimitSeen = Partial<Record<LimitKey, { resetsAt: number; step: number }>>

export interface LimitWarning {
  key: LimitKey
  /** The step just reached: 80 or 95. */
  step: number
  pct: number
  resetsAt: number
}

/** The highest step a percentage has reached, or 0. */
export function stepOf(pct: number): number {
  return LIMIT_STEPS.filter(s => pct >= s).pop() || 0
}

/**
 * Compares a fresh reading with what was seen before: the warnings to give now, and what to remember.
 * A limit warns once per step per window; a new window (its reset time moved) starts again.
 * The first reading after launch is only remembered, so restarting the app never repeats a warning.
 */
export function limitWarnings(u: PlanUsage | null, seen: LimitSeen | null): { warn: LimitWarning[]; seen: LimitSeen } {
  const next: LimitSeen = { ...(seen || {}) }
  const warn: LimitWarning[] = []
  if (!u) return { warn, seen: next }
  for (const key of ['five', 'week'] as const) {
    const w = u[key]
    if (!w) continue
    const step = stepOf(w.pct)
    const was = seen?.[key]
    // Reset times come back with slightly different seconds: a new window is one that starts well after the last.
    const sameWindow = !!was && Math.abs(was.resetsAt - w.resetsAt) < 60 * 60_000
    const told = sameWindow ? was!.step : 0
    if (seen && step > told) warn.push({ key, step, pct: w.pct, resetsAt: w.resetsAt })
    next[key] = { resetsAt: w.resetsAt, step: Math.max(step, told) }
  }
  return { warn, seen: next }
}
