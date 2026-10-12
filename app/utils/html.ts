/** Text made safe to put inside HTML, in element content or in a quoted attribute. */
const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ENTITIES[c]!)
}

/**
 * A plain copy of reactive data. IPC and structuredClone refuse Vue's proxies; a JSON round trip drops them.
 */
export function plain<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

/** `v` limited to lo..hi, as a whole number. */
export function clampInt(v: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, v)))
}
