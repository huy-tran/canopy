import { describe, expect, it } from 'vitest'
import { limitWarnings, stepOf } from '../shared/planlimit'
import type { PlanUsage } from '../shared/types'

const HOUR = 3_600_000
const reset = 1_800_000_000_000
const usage = (five: number | null, week: number | null, at = reset): PlanUsage => ({
  five: five == null ? null : { pct: five, resetsAt: at },
  week: week == null ? null : { pct: week, resetsAt: at + 100 * HOUR },
})

describe('stepOf', () => {
  it('is the highest step reached', () => {
    expect(stepOf(79.9)).toBe(0)
    expect(stepOf(80)).toBe(80)
    expect(stepOf(94)).toBe(80)
    expect(stepOf(100)).toBe(95)
  })
})

describe('limitWarnings', () => {
  it('only remembers the first reading, however high', () => {
    const r = limitWarnings(usage(97, 85), null)
    expect(r.warn).toEqual([])
    expect(r.seen).toEqual({ five: { resetsAt: reset, step: 95 }, week: { resetsAt: reset + 100 * HOUR, step: 80 } })
  })

  it('warns once as each step is reached', () => {
    let r = limitWarnings(usage(50, 10), null)
    r = limitWarnings(usage(82, 10), r.seen)
    expect(r.warn).toEqual([{ key: 'five', step: 80, pct: 82, resetsAt: reset }])
    r = limitWarnings(usage(90, 10), r.seen)
    expect(r.warn).toEqual([])
    r = limitWarnings(usage(96, 10), r.seen)
    expect(r.warn.map(w => w.step)).toEqual([95])
    r = limitWarnings(usage(99, 10), r.seen)
    expect(r.warn).toEqual([])
  })

  it('goes straight to the higher step when both are passed between readings', () => {
    const first = limitWarnings(usage(10, 10), null)
    expect(limitWarnings(usage(10, 97), first.seen).warn).toEqual([{ key: 'week', step: 95, pct: 97, resetsAt: reset + 100 * HOUR }])
  })

  it('starts again in a new window, but not when the reset time only shifts by seconds', () => {
    let r = limitWarnings(usage(50, 10), null)
    r = limitWarnings(usage(85, 10), r.seen)
    expect(limitWarnings(usage(86, 10, reset + 2000), r.seen).warn).toEqual([])
    r = limitWarnings(usage(5, 10, reset + 5 * HOUR), r.seen)
    expect(r.warn).toEqual([])
    expect(limitWarnings(usage(81, 10, reset + 5 * HOUR), r.seen).warn.map(w => w.key)).toEqual(['five'])
  })

  it('keeps what it knew when a reading fails or a limit is missing', () => {
    const first = limitWarnings(usage(85, 10), null)
    expect(limitWarnings(null, first.seen)).toEqual({ warn: [], seen: first.seen })
    expect(limitWarnings(usage(null, 10), first.seen).seen.five).toEqual(first.seen.five)
  })
})
