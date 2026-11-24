import { isServeCommand } from './devdetect'

/** What Lookout learns about one repo of a project: the site a manager serves for it, and whether it has a dev server with a port of its own. */
export interface RepoProbe { id: string; site: string; frontend: boolean }

/**
 * The repo Lookout shows: the focused session's, else one with a frontend dev server, else one with a site.
 * Repos with neither are never picked. Ties keep the project's order.
 */
export function pickTarget(repos: RepoProbe[], focus?: string): RepoProbe | null {
  const rank = (r: RepoProbe) => (r.id === focus ? 0 : 2) + (r.site ? 1 : 0)
  return repos.filter(r => r.site || r.frontend).sort((a, b) => rank(a) - rank(b))[0] || null
}

/** Serve's reach: every service of the chosen repo, and of the others only what Serve writes for a Laravel backend (queue, scheduler, Reverb). No repo chosen means all of it. */
export function inServeScope(cmd: string, isTarget: boolean, hasTarget: boolean): boolean {
  return !hasTarget || isTarget || isServeCommand(cmd)
}

/** Is the address one Canopy put there (a repo's site, or a port of the project's own servers) rather than one typed by hand? */
export function ownedAddress(addr: string, sites: string[], ports: string[]): boolean {
  let u: URL
  try { u = new URL(addr) } catch { return false }
  const hostOf = (s: string) => { try { return new URL(s).host } catch { return '' } }
  if (sites.some(s => hostOf(s) === u.host)) return true
  return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) && ports.includes(u.port)
}
