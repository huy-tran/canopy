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
 * A schedule with a date runs on that day alone, whatever its weekdays say.
 */
export function dueAt(s: Schedule, now: number): number | null {
  if (!s.enabled || !s.prompt.trim()) return null
  const mins = minutesOf(s.time)
  if (mins == null) return null
  const d = new Date(now)
  if (s.date ? dayOf(now) !== s.date : !s.days.includes(d.getDay())) return null
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0)
  const at = d.getTime()
  return now >= at && s.lastRun < at ? at : null
}

/** The local day of a moment, as "YYYY-MM-DD". */
export function dayOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** True for a one-off schedule whose day has gone by: it will never run again. */
export function expired(s: Schedule, now: number): boolean {
  return !!s.date && s.date < dayOf(now)
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Weekdays at 09:00", or "Once on Tue 24 Nov at 09:00" for a one-off. */
export function whenLabel(s: Schedule): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date || '')
  if (!m) return `${daysLabel(s.days)} at ${s.time}`
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!)
  return `Once on ${DAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]} at ${s.time}`
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
