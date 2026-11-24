// Works out the dev server a project runs, from its package.json, composer.json and lockfiles.
// Pure, so it is tested without a disk; electron/services/detect.ts reads the files.

export interface DetectedServer {
  cmd: string
  port: string
  /** Shown to the user: "Laravel", "Nuxt", "Vite"... */
  label: string
}

export interface ProjectFiles {
  /** Parsed package.json, if the folder has one. */
  pkg?: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  /** Parsed composer.json. */
  composer?: { require?: Record<string, string>; 'require-dev'?: Record<string, string> }
  artisan?: boolean
  /** Lockfile names found in the folder. */
  locks?: string[]
  /** Herd is installed, so PHP runs as `herd php`. */
  herd?: boolean
  /** Django: a manage.py at the root. */
  manage?: boolean
  /** Rails: bin/rails and a Gemfile. */
  rails?: boolean
  /** Hugo: a hugo.toml/yaml/json or config.toml at the root. */
  hugo?: boolean
}

/** Frameworks in order of precedence (a Nuxt app also has vite), with their default port. */
const JS: { dep: string; label: string; port: string }[] = [
  { dep: 'nuxt', label: 'Nuxt', port: '3000' },
  { dep: 'next', label: 'Next.js', port: '3000' },
  { dep: 'astro', label: 'Astro', port: '4321' },
  { dep: '@angular/core', label: 'Angular', port: '4200' },
  { dep: '@sveltejs/kit', label: 'SvelteKit', port: '5173' },
  { dep: '@remix-run/dev', label: 'Remix', port: '5173' },
  { dep: 'react-scripts', label: 'React', port: '3000' },
  { dep: 'gatsby', label: 'Gatsby', port: '8000' },
  { dep: '@vue/cli-service', label: 'Vue CLI', port: '8080' },
  { dep: 'vite', label: 'Vite', port: '5173' },
  { dep: 'webpack-dev-server', label: 'Webpack', port: '8080' },
]

function runner(locks: string[] = []) {
  if (locks.includes('pnpm-lock.yaml')) return 'pnpm run'
  if (locks.includes('yarn.lock')) return 'yarn'
  if (locks.includes('bun.lock') || locks.includes('bun.lockb')) return 'bun run'
  return 'npm run'
}

/** A port the script itself sets: `--port 4000`, `-p 4000`, `--port=4000` or `PORT=4000`. */
function scriptPort(script: string): string | null {
  return /(?:--port[ =]|\s-p[ =]?|\bPORT=)(\d{2,5})\b/.exec(script)?.[1] ?? null
}

export function detectDevServers(f: ProjectFiles): DetectedServer[] {
  const out: DetectedServer[] = []
  const deps = { ...(f.pkg?.dependencies || {}), ...(f.pkg?.devDependencies || {}) }
  const scripts = f.pkg?.scripts || {}
  const script = ['dev', 'start', 'serve'].find(s => scripts[s])
  const run = runner(f.locks)
  const php = f.herd ? 'herd php' : 'php'

  const laravel = !!f.artisan && !!(f.composer?.require?.['laravel/framework'] || f.composer?.['require-dev']?.['laravel/framework'])
  if (laravel) out.push({ cmd: `${php} artisan serve --port=8000`, port: '8000', label: 'Laravel' })

  if (f.manage) out.push({ cmd: 'python manage.py runserver 8000', port: '8000', label: 'Django' })
  if (f.rails) out.push({ cmd: 'bin/rails server -p 3000', port: '3000', label: 'Rails' })
  if (f.hugo) out.push({ cmd: 'hugo server', port: '1313', label: 'Hugo' })

  if (script) {
    const fw = JS.find(j => deps[j.dep])
    // A Laravel app's JS is only its assets (vite), listed after the PHP server.
    if (fw) out.push({ cmd: `${run} ${script}`, port: scriptPort(scripts[script]!) || fw.port, label: fw.label })
    else if (!out.length && !f.composer && !f.manage && !f.rails && !f.hugo) out.push({ cmd: `${run} ${script}`, port: scriptPort(scripts[script]!) || '', label: 'Node' })
  }
  return out
}

export interface LaravelFacts extends ProjectFiles {
  /** .env sets QUEUE_CONNECTION=sync: jobs run inside the request, so no worker is needed. */
  queueSync?: boolean
  /** The app schedules something (a Schedule:: call in routes/console.php, or a Console Kernel). */
  scheduled?: boolean
  /** A local site manager (Herd, Lerd, Flock) serves this folder, so `artisan serve` is not needed. Not the same as Herd being installed. */
  served?: boolean
  /** The site manager runs the queue, scheduler and Reverb itself (Lerd's `workers:`): Serve must not start a second copy. */
  managedWorkers?: boolean
  /** REVERB_SERVER_PORT from .env, when it sets one. */
  reverbPort?: string
}

export function isLaravel(f: ProjectFiles): boolean {
  return !!f.artisan && !!(f.composer?.require?.['laravel/framework'] || f.composer?.['require-dev']?.['laravel/framework'])
}

/** The commands Serve itself writes for a Laravel app, which is what tells a stale one (kept from an earlier detection) from a service added by hand. */
const SERVE_COMMANDS = /^(?:herd )?php artisan (?:serve(?: --port=\d+)?|queue:work|horizon|schedule:work|reverb:start(?: --port=\d+)?)$/

export function isServeCommand(cmd: string): boolean {
  return SERVE_COMMANDS.test(cmd.trim())
}

/**
 * What "Serve" runs for a Laravel app: the background processes its code and packages call for (queue worker or Horizon,
 * Reverb, the scheduler) and, when it has a frontend, its asset dev server. `artisan serve` only when no site manager serves
 * the folder, and no workers when the site manager runs them. Empty when the folder is not a Laravel app.
 */
export function detectLaravelServe(f: LaravelFacts): DetectedServer[] {
  if (!isLaravel(f)) return []
  const out: DetectedServer[] = []
  const req = { ...(f.composer?.require || {}), ...(f.composer?.['require-dev'] || {}) }
  const php = f.herd ? 'herd php' : 'php'

  if (!f.served) out.push({ cmd: `${php} artisan serve --port=8000`, port: '8000', label: 'Laravel' })
  if (!f.managedWorkers) {
    if (req['laravel/horizon']) out.push({ cmd: `${php} artisan horizon`, port: '', label: 'Horizon' })
    else if (!f.queueSync) out.push({ cmd: `${php} artisan queue:work`, port: '', label: 'Queue' })
    if (req['laravel/reverb']) {
      const port = f.reverbPort || '8080'
      out.push({ cmd: port === '8080' ? `${php} artisan reverb:start` : `${php} artisan reverb:start --port=${port}`, port, label: 'Reverb' })
    }
    if (f.scheduled) out.push({ cmd: `${php} artisan schedule:work`, port: '', label: 'Scheduler' })
  }

  // The frontend: whichever of dev/start/serve the package.json has, run with the package manager its lockfile names.
  const script = ['dev', 'start', 'serve'].find(s => f.pkg?.scripts?.[s])
  if (script) {
    const deps = { ...(f.pkg?.dependencies || {}), ...(f.pkg?.devDependencies || {}) }
    const fw = JS.find(j => deps[j.dep])
    out.push({ cmd: `${runner(f.locks)} ${script}`, port: scriptPort(f.pkg!.scripts![script]!) || fw?.port || '', label: fw?.label || 'Frontend' })
  }
  return out
}

export interface InstallFacts {
  locks?: string[]
  herd?: boolean
  hasNodeModules?: boolean
  hasVendor?: boolean
}

/**
 * The command that installs what `cmd` needs before it can run (node_modules, vendor, gems), or null when nothing is missing
 * or `cmd` is not one of those. Works in cmd.exe and POSIX shells alike (only `&&` and `||` are used).
 */
export function installStep(cmd: string, f: InstallFacts): string | null {
  const c = cmd.trim()
  if (/^(npm|pnpm|yarn|bun)\b/.test(c)) return f.hasNodeModules ? null : `${runner(f.locks).replace(/ run$/, '')} install`
  if (/^(herd )?php\s+artisan\b/.test(c)) return f.hasVendor ? null : `${f.herd ? 'herd composer' : 'composer'} install`
  if (/^bin[\\/]rails\b/.test(c)) return 'bundle check || bundle install'
  return null
}

/** `cmd`, with its install step in front when one is needed. */
export function withInstall(cmd: string, f: InstallFacts): string {
  const step = installStep(cmd, f)
  return step ? `${step} && ${cmd}` : cmd
}

/** The port in a "Local: http://localhost:5174/" style line a dev server prints (Vite, Nuxt, Next, artisan serve...); only this machine's addresses count. */
export function listeningPort(chunk: string): number | null {
  // eslint-disable-next-line no-control-regex
  const text = chunk.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  const m = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[\w-]+\.localhost):(\d{2,5})/i.exec(text)
  const n = m ? parseInt(m[1]!, 10) : 0
  return n > 0 && n < 65536 ? n : null
}
