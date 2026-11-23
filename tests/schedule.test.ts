import { describe, expect, it } from 'vitest'
import { daysLabel, dueAt, minutesOf } from '../shared/schedule'
import type { Schedule } from '../shared/types'

/** A Wednesday. */
const at = (h: number, m = 0) => new Date(2026, 10, 25, h, m).getTime()
const sched = (o: Partial<Schedule> = {}): Schedule => ({ id: 'c', name: 'Bump', pid: 'p', repoId: 'r', prompt: 'Go', time: '09:00', days: [1, 2, 3, 4, 5], wt: true, enabled: true, lastRun: 0, ...o })

describe('minutesOf', () => {
  it('reads a time of day and rejects anything else', () => {
    expect(minutesOf('09:30')).toBe(570)
    expect(minutesOf('0:00')).toBe(0)
    expect(minutesOf('24:00')).toBeNull()
    expect(minutesOf('9am')).toBeNull()
  })
})

describe('dueAt', () => {
  it('is due from its time on, on its days', () => {
    expect(dueAt(sched(), at(8, 59))).toBeNull()
    expect(dueAt(sched(), at(9))).toBe(at(9))
    expect(dueAt(sched(), at(15))).toBe(at(9))
    expect(dueAt(sched({ days: [0, 6] }), at(15))).toBeNull()
  })

  it('runs once a day: not again after it ran, nor for a time that passed before it was saved', () => {
    expect(dueAt(sched({ lastRun: at(9, 0) + 500 }), at(9, 1))).toBeNull()
    expect(dueAt(sched({ lastRun: at(11) }), at(15))).toBeNull()
    // Ran yesterday: due again today.
    expect(dueAt(sched({ lastRun: at(9) - 86_400_000 + 1000 }), at(9))).toBe(at(9))
  })

  it('is never due while off, without a prompt, or with a broken time', () => {
    expect(dueAt(sched({ enabled: false }), at(10))).toBeNull()
    expect(dueAt(sched({ prompt: ' ' }), at(10))).toBeNull()
    expect(dueAt(sched({ time: 'soon' }), at(10))).toBeNull()
  })
})

describe('daysLabel', () => {
  it('names the usual sets and lists the rest from Monday', () => {
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day')
    expect(daysLabel([5, 1, 2, 3, 4])).toBe('Weekdays')
    expect(daysLabel([6, 0])).toBe('Weekends')
    expect(daysLabel([0, 3, 1])).toBe('Mon, Wed, Sun')
    expect(daysLabel([])).toBe('Never')
  })
})
