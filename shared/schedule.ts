// When a scheduled prompt is due.
import type { Schedule } from './types'

/** "HH:MM" as minutes into the day, or null when it isn't a time. */
export function minutesOf(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = +m[1]!, min = +m[2]!
  return h < 24 && min < 60 ? h * 60 + min : null
}

/**
 * The moment today's run was due, when it still has to happen: the schedule is on, today is one of its days,
 * the time has come, and it has not run (or been edited) since. Null otherwise.
 * A run missed while the app was closed happens once it is open again, on the same day only.
 */
export function dueAt(s: Schedule, now: number): number | null {
  if (!s.enabled || !s.prompt.trim()) return null
  const mins = minutesOf(s.time)
  if (mins == null) return null
  const d = new Date(now)
  if (!s.days.includes(d.getDay())) return null
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  const at = d.getTime()
  return now >= at && s.lastRun < at ? at : null
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Every day", "Weekdays", "Mon, Wed" and so on. */
export function daysLabel(days: number[]): string {
  const set = [...new Set(days)].filter(d => d >= 0 && d <= 6).sort()
  if (set.length === 7) return 'Every day'
  if (!set.length) return 'Never'
  if (set.join() === '1,2,3,4,5') return 'Weekdays'
  if (set.join() === '0,6') return 'Weekends'
  // Monday first, as the buttons show them.
  return [...set.filter(d => d > 0), ...set.filter(d => d === 0)].map(d => DAY[d]).join(', ')
}
