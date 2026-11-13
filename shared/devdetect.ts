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

  if (script) {
    const fw = JS.find(j => deps[j.dep])
    // A Laravel app's JS is only its assets (vite), listed after the PHP server.
    if (fw) out.push({ cmd: `${run} ${script}`, port: scriptPort(scripts[script]!) || fw.port, label: fw.label })
    else if (!out.length && !f.composer) out.push({ cmd: `${run} ${script}`, port: scriptPort(scripts[script]!) || '', label: 'Node' })
  }
  return out
}

/** The port in a "Local: http://localhost:5174/" style line a dev server prints (Vite, Nuxt, Next, artisan serve...); only this machine's addresses count. */
export function listeningPort(chunk: string): number | null {
  // eslint-disable-next-line no-control-regex
  const text = chunk.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
  const m = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[\w-]+\.localhost):(\d{2,5})/i.exec(text)
  const n = m ? parseInt(m[1]!, 10) : 0
  return n > 0 && n < 65536 ? n : null
}
