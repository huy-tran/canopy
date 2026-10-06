// Formatting helpers, ported from the prototype.

export const HUES = [20, 45, 65, 80, 100, 120, 140, 160, 185, 205, 230, 255, 275, 295, 320, 345]

export function k(n: number): string {
  return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n))
}

export function usd(v: number): string {
  return '$' + v.toFixed(2)
}

export function ago(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 45) return 'now'
  const m = Math.max(1, Math.round(s / 60))
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  return Math.floor(h / 24) + 'd'
}

export function dur(ms: number, sec?: boolean): string {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60)
  if (h) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  if (m) return sec ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${m}m`
  return `${s}s`
}

export function clock(ts: number): string {
  const d = new Date(ts)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/** Project colour: oklch(0.72 0.12 H), optionally with alpha. */
export function pcol(h: number, a?: number): string {
  return `oklch(0.72 0.12 ${h}${a != null ? ' / ' + a : ''})`
}

/** Project colour for text, with lightness and chroma set per theme so it reads on either. */
export function ptx(h: number): string {
  return `oklch(var(--ptl) var(--ptc) ${h})`
}

export function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/** "C:\\code\\acme-api" -> "API"; used to prefill a repo label from its folder. */
export function guessLabel(p: string): string {
  const b = (p.split(/[\\/]/).pop() || '').toLowerCase()
  if (/api/.test(b)) return 'API'
  if (/cms/.test(b)) return 'CMS'
  if (/(web|app|fe|portal|site)$/.test(b)) return 'FE'
  return b
}

export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

/** Status colours and labels used across the app. */
export const SC: Record<string, string> = { working: 'var(--blue)', waiting: 'var(--ambf)', done: 'var(--grn)', idle: 'var(--idle)' }
export const SL: Record<string, string> = { working: 'Working', waiting: 'Waiting', done: 'Done', idle: 'Idle' }

/** "Ctrl+Shift+P" -> "Ctrl Shift P" */
export function niceKey(combo: string | undefined): string {
  return combo ? combo.replace(/\+/g, ' ') : ''
}
