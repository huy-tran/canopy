// Reads a project folder for shared/devdetect.ts: which dev server it runs.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { configPort, detectDevServers, detectLaravelServe, isLaravel, withInstall, type DetectedServer } from '../../shared/devdetect'
import { siteOf } from './sites'

function json(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}

let herd: Promise<boolean> | undefined
function hasHerd(): Promise<boolean> {
  herd ??= new Promise(resolve => execFile(process.platform === 'win32' ? 'where' : 'which', ['herd'], { windowsHide: true }, err => resolve(!err)))
  return herd
}

/** `cmd` with the install it needs in front (npm install, composer install...) when the folder has no node_modules or vendor yet. */
export async function commandWithInstall(dir: string, cmd: string): Promise<string> {
  const has = (n: string) => fs.existsSync(path.join(dir, n))
  return withInstall(cmd, {
    locks: ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'package-lock.json'].filter(has),
    herd: await hasHerd(),
    hasNodeModules: has('node_modules'),
    hasVendor: has('vendor'),
  })
}

function text(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

/** Does a Blade view of the app (or one of its modules) call a live `@vite(`? Looks at a few hundred files at most. */
function usesVite(dir: string): boolean {
  const stack = [path.join(dir, 'resources', 'views')]
  let seen = 0
  while (stack.length && seen < 400) {
    const d = stack.pop()!
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.name.endsWith('.blade.php') && ++seen && /^(?!\s*\{\{--).*@vite\s*\(/m.test(text(p))) return true
    }
  }
  return false
}

/** The dev port the framework's own config sets (quasar.config, vite.config, nuxt.config), if any. */
function devPort(dir: string): string | undefined {
  for (const n of ['quasar.config.js', 'quasar.config.ts', 'quasar.config.mjs', 'vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.mts', 'nuxt.config.ts', 'nuxt.config.js']) {
    const p = configPort(text(path.join(dir, n)))
    if (p) return p
  }
  return undefined
}

/** What "Serve" runs: for a Laravel app its queue, Reverb, scheduler and frontend (see detectLaravelServe), for anything else its dev server. */
export async function detectServe(dir: string): Promise<DetectedServer[]> {
  if (typeof dir !== 'string' || !dir) return []
  const composer = json(path.join(dir, 'composer.json'))
  if (!isLaravel({ artisan: fs.existsSync(path.join(dir, 'artisan')), composer })) return detectServers(dir)
  const has = (n: string) => fs.existsSync(path.join(dir, n))
  const env = text(path.join(dir, '.env'))
  const site = siteOf(dir)
  return detectLaravelServe({
    pkg: json(path.join(dir, 'package.json')),
    composer: json(path.join(dir, 'composer.json')),
    artisan: has('artisan'),
    locks: ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'package-lock.json'].filter(has),
    herd: await hasHerd(),
    devPort: devPort(dir),
    usesVite: usesVite(dir),
    served: !!site,
    managedWorkers: !!site?.managedWorkers,
    reverbPort: /^\s*REVERB_SERVER_PORT\s*=\s*["']?(\d{2,5})/m.exec(env)?.[1],
    queueSync: /^\s*QUEUE_CONNECTION\s*=\s*["']?sync\b/m.test(env),
    scheduled: /\bSchedule::/.test(text(path.join(dir, 'routes', 'console.php'))) || has(path.join('app', 'Console', 'Kernel.php')),
  })
}

export async function detectServers(dir: string): Promise<DetectedServer[]> {
  if (typeof dir !== 'string' || !dir) return []
  const has = (n: string) => fs.existsSync(path.join(dir, n))
  return detectDevServers({
    pkg: json(path.join(dir, 'package.json')),
    composer: json(path.join(dir, 'composer.json')),
    artisan: has('artisan'),
    locks: ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'package-lock.json'].filter(has),
    herd: await hasHerd(),
    devPort: devPort(dir),
    manage: has('manage.py'),
    rails: has(path.join('bin', 'rails')) && has('Gemfile'),
    hugo: ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml'].some(has),
  })
}

/** The address a local site manager (Herd, Lerd, Flock) serves a Laravel app at; '' when it is not a Laravel app or none serves it. */
export async function laravelSite(dir: string): Promise<string> {
  if (typeof dir !== 'string' || !dir) return ''
  const composer = json(path.join(dir, 'composer.json'))
  if (!isLaravel({ artisan: fs.existsSync(path.join(dir, 'artisan')), composer })) return ''
  return siteOf(dir)?.url || ''
}
