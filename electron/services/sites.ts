// Reads the local site managers' files (Herd, Lerd, Flock) for shared/sites.ts: does one serve this folder, and where.
// Each is found by its own data file, never by a name on PATH: util-linux ships a `flock` of its own on Linux.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { entryFor, entrySecured, folderName, isParked, lerdRunsWorkers, mentionsPath, norm, parentOf, siteUrl, type SiteInfo } from '../../shared/sites'

function text(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function json(file: string): any {
  try {
    return JSON.parse(text(file))
  } catch {
    return undefined
  }
}

function real(p: string): string {
  try {
    return norm(fs.realpathSync(p))
  } catch {
    return norm(path.resolve(p))
  }
}

const HERD_DIR = path.join(os.homedir(), '.config', 'herd', 'config', 'valet')
const LERD_REGISTRY = path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'lerd', 'sites.yaml')

function flockDir(): string {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Flock')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Flock')
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'flock')
}

/** Herd serves a folder that is parked (inside one of its paths) or linked (a symlink in its Sites folder, whose name is the site's). */
function herd(dir: string): SiteInfo | null {
  const config = json(path.join(HERD_DIR, 'config.json'))
  if (!config) return null
  const tld: string = config.tld || 'test'
  const me = real(dir)
  let name = ''
  try {
    name = fs.readdirSync(path.join(HERD_DIR, 'Sites')).find(n => real(path.join(HERD_DIR, 'Sites', n)) === me) || ''
  } catch {
    // No linked sites.
  }
  const parked = isParked(dir, Array.isArray(config.paths) ? config.paths.map(String) : [])
  if (!name && !parked) return null
  name = (name || folderName(dir)).toLowerCase()
  // Herd writes an nginx conf for a secured site, with a 443 listener.
  const secured = /listen\s+[^;]*\b443\b/.test(text(path.join(HERD_DIR, 'Nginx', `${name}.${tld}.conf`)))
  return { tool: 'herd', url: siteUrl(secured, name, tld), managedWorkers: false }
}

/** Lerd lists each registered project in sites.yaml, and runs the workers a project's .lerd.yaml names. */
function lerd(dir: string): SiteInfo | null {
  const registry = text(LERD_REGISTRY)
  const entry = entryFor(registry, dir)
  if (!entry) return null
  return { tool: 'lerd', url: siteUrl(entrySecured(entry), folderName(dir), 'test'), managedWorkers: lerdRunsWorkers(text(path.join(dir, '.lerd.yaml'))) }
}

/** Flock serves every folder inside a parked one, and each linked site; it secures every site by default. */
function flock(dir: string): SiteInfo | null {
  const file = path.join(flockDir(), 'config.json')
  const raw = text(file)
  if (!raw) return null
  if (!mentionsPath(raw, dir) && !mentionsPath(raw, parentOf(dir))) return null
  const tld = typeof json(file)?.tld === 'string' && json(file).tld ? json(file).tld : 'test'
  return { tool: 'flock', url: siteUrl(true, folderName(dir), tld), managedWorkers: false }
}

/** The site manager serving this folder, with its address; null when none does (a folder outside every parked path and never linked). */
export function siteOf(dir: string): SiteInfo | null {
  if (typeof dir !== 'string' || !dir) return null
  return herd(dir) || lerd(dir) || flock(dir)
}
