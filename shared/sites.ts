// Which local site manager (Herd, Lerd, Flock) serves a project folder, and at what address.
// Pure, so it is tested without a disk; electron/services/sites.ts reads the files.
//
// Lerd and Flock do not document their registry files, so a folder counts as theirs when its path is written in the
// registry, whatever the layout. The name is the folder's name, which both use unless told otherwise.

export type SiteTool = 'herd' | 'lerd' | 'flock'

export interface SiteInfo {
  tool: SiteTool
  /** http(s)://folder.test */
  url: string
  /** The manager runs the project's queue, scheduler and Reverb itself (Lerd's `workers:` in .lerd.yaml), so Serve must not start a second copy. */
  managedWorkers: boolean
}

/** A path as one comparable string: forward slashes (JSON writes `\\`), no trailing slash, lowercase. */
export function norm(p: string): string {
  return p.replace(/\\+/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '').toLowerCase()
}

export function parentOf(dir: string): string {
  const n = norm(dir)
  return n.slice(0, Math.max(0, n.lastIndexOf('/')))
}

/** The folder's name, lowercase: the site name when nothing says otherwise. */
export function folderName(dir: string): string {
  const n = norm(dir)
  return n.slice(n.lastIndexOf('/') + 1)
}

/** Is `dir` directly inside one of the parked folders? */
export function isParked(dir: string, parked: string[]): boolean {
  const parent = parentOf(dir)
  return !!parent && parked.some(p => norm(p) === parent)
}

/** Does `text` write down `dir` as a whole path (not as the start of a longer one: `app` against `app-2`)? */
export function mentionsPath(text: string, dir: string): boolean {
  const hay = norm(text)
  const needle = norm(dir)
  if (!needle) return false
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    const next = hay[i + needle.length]
    if (next === undefined || !/[\w.-]/.test(next)) return true
  }
  return false
}

/** The registry entry (a `- ` list item, or the whole text when it is not a list) that writes down `dir`; '' when none does. */
export function entryFor(registry: string, dir: string): string {
  const items = registry.split(/^\s*-\s+/m)
  return items.find(i => mentionsPath(i, dir)) || (items.length === 1 && mentionsPath(registry, dir) ? registry : '')
}

/** Does the entry say the site is secured (`secured: true`, `https: true`)? */
export function entrySecured(entry: string): boolean {
  return /^\s*(?:secured?|https|ssl)\s*:\s*true\b/im.test(entry)
}

/** Does a project's .lerd.yaml list workers (queue, horizon, schedule, reverb) for Lerd to run? */
export function lerdRunsWorkers(lerdYaml: string): boolean {
  return /^workers\s*:\s*\n(?:\s*-\s*\S+\s*\n?)+/m.test(lerdYaml) || /^workers\s*:\s*\[\s*\S/m.test(lerdYaml)
}

export function siteUrl(secured: boolean, name: string, tld: string): string {
  return `${secured ? 'https' : 'http'}://${name}.${tld}`
}
