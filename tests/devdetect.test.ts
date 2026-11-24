import { describe, expect, it } from 'vitest'
import { configPort, detectDevServers, detectLaravelServe, isServeCommand, listeningPort, withInstall } from '../shared/devdetect'

describe('detectDevServers', () => {
  it('runs a Laravel app with artisan, and its vite assets beside it', () => {
    const r = detectDevServers({ artisan: true, composer: { require: { 'laravel/framework': '^12' } }, pkg: { scripts: { dev: 'vite' }, devDependencies: { vite: '^6' } }, locks: ['package-lock.json'] })
    expect(r.map(s => [s.label, s.cmd, s.port])).toEqual([
      ['Laravel', 'php artisan serve --port=8000', '8000'],
      ['Vite', 'npm run dev', '5173'],
    ])
  })

  it('uses herd php when Herd is installed', () => {
    const r = detectDevServers({ artisan: true, composer: { require: { 'laravel/framework': '^12' } }, herd: true })
    expect(r[0]!.cmd).toBe('herd php artisan serve --port=8000')
  })

  it('picks Nuxt over the vite it carries, and the package manager from the lockfile', () => {
    const r = detectDevServers({ pkg: { scripts: { dev: 'nuxt dev' }, dependencies: { nuxt: '^4' }, devDependencies: { vite: '^6' } }, locks: ['pnpm-lock.yaml'] })
    expect(r).toEqual([{ cmd: 'pnpm run dev', port: '3000', label: 'Nuxt' }])
  })

  it('takes a port the script sets', () => {
    expect(detectDevServers({ pkg: { scripts: { dev: 'vite --port 4100' }, devDependencies: { vite: '1' } } })[0]!.port).toBe('4100')
    expect(detectDevServers({ pkg: { scripts: { start: 'PORT=3500 react-scripts start' }, dependencies: { 'react-scripts': '5' } } })[0]).toMatchObject({ cmd: 'npm run start', port: '3500' })
  })

  it('knows a plain node app has no known port, and a folder with nothing to run', () => {
    expect(detectDevServers({ pkg: { scripts: { dev: 'node server.js' } } })).toEqual([{ cmd: 'npm run dev', port: '', label: 'Node' }])
    expect(detectDevServers({})).toEqual([])
  })

  it('puts an install in front only when dependencies are missing', () => {
    expect(withInstall('npm run dev', {})).toBe('npm install && npm run dev')
    expect(withInstall('pnpm run dev', { locks: ['pnpm-lock.yaml'] })).toBe('pnpm install && pnpm run dev')
    expect(withInstall('yarn dev', { locks: ['yarn.lock'] })).toBe('yarn install && yarn dev')
    expect(withInstall('npm run dev', { hasNodeModules: true })).toBe('npm run dev')
    expect(withInstall('php artisan serve --port=8000', {})).toBe('composer install && php artisan serve --port=8000')
    expect(withInstall('herd php artisan serve', { herd: true })).toBe('herd composer install && herd php artisan serve')
    expect(withInstall('php artisan serve', { hasVendor: true })).toBe('php artisan serve')
    expect(withInstall('bin/rails server -p 3000', {})).toBe('bundle check || bundle install && bin/rails server -p 3000')
    expect(withInstall('hugo server', {})).toBe('hugo server')
  })

  it('knows Quasar, and takes the port its config sets', () => {
    const pkg = { scripts: { dev: 'quasar dev' }, dependencies: { quasar: '^2' }, devDependencies: { '@quasar/app-vite': '^2', vite: '^6' } }
    expect(detectDevServers({ pkg, locks: ['yarn.lock'] })).toEqual([{ cmd: 'yarn dev', port: '9000', label: 'Quasar' }])
    expect(detectDevServers({ pkg, locks: ['yarn.lock'], devPort: '8000' })[0]).toMatchObject({ port: '8000' })
  })

  it('reads a dev port from a framework config', () => {
    expect(configPort('devServer: {\n  // https: true\n  port: 8000,\n  open: true\n}')).toBe('8000')
    expect(configPort('export default { server: { port: 4100 } }')).toBe('4100')
    expect(configPort('export default { build: { outDir: "x" } }')).toBeUndefined()
  })

  it('knows Django, Rails and Hugo', () => {
    expect(detectDevServers({ manage: true })[0]).toMatchObject({ label: 'Django', port: '8000' })
    expect(detectDevServers({ rails: true })[0]).toMatchObject({ label: 'Rails', port: '3000' })
    expect(detectDevServers({ hugo: true })[0]).toMatchObject({ label: 'Hugo', port: '1313' })
  })
})

describe('listeningPort', () => {
  it('reads the port a server says it moved to', () => {
    expect(listeningPort('  \x1b[32m➜\x1b[39m  Local:   http://localhost:5174/')).toBe(5174)
    expect(listeningPort('Server running on [http://127.0.0.1:8001].')).toBe(8001)
    expect(listeningPort('Local:    http://localhost:3000/')).toBe(3000)
  })

  it('ignores addresses that are not this machine, and lines with none', () => {
    expect(listeningPort('Network: http://192.168.1.5:5173/')).toBeNull()
    expect(listeningPort('ready in 312 ms')).toBeNull()
  })
})

describe('detectLaravelServe', () => {
  const app = { artisan: true, composer: { require: { 'laravel/framework': '^12' } } }

  it('skips artisan serve under Herd and runs the worker, scheduler and frontend', () => {
    const r = detectLaravelServe({ ...app, herd: true, served: true, scheduled: true, pkg: { scripts: { dev: 'vite' }, devDependencies: { vite: '^6' } }, locks: ['yarn.lock'] })
    expect(r.map(s => [s.label, s.cmd])).toEqual([
      ['Queue', 'herd php artisan queue:work'],
      ['Scheduler', 'herd php artisan schedule:work'],
      ['Vite', 'yarn dev'],
    ])
  })

  it('serves the site itself when no site manager does', () => {
    expect(detectLaravelServe(app)[0]).toMatchObject({ cmd: 'php artisan serve --port=8000', port: '8000' })
    // Herd installed, but this folder is neither parked nor linked.
    expect(detectLaravelServe({ ...app, herd: true })[0]).toMatchObject({ cmd: 'herd php artisan serve --port=8000' })
  })

  it('prefers Horizon to a plain worker, adds Reverb, and drops the worker when queues are sync', () => {
    const r = detectLaravelServe({ ...app, served: true, composer: { require: { 'laravel/framework': '^12', 'laravel/horizon': '^5', 'laravel/reverb': '^1' } } })
    expect(r.map(s => s.label)).toEqual(['Horizon', 'Reverb'])
    expect(detectLaravelServe({ ...app, served: true, queueSync: true })).toEqual([])
  })

  it('takes Reverb\'s port from .env', () => {
    const composer = { require: { 'laravel/framework': '^12', 'laravel/reverb': '^1' } }
    expect(detectLaravelServe({ ...app, composer, served: true, queueSync: true, reverbPort: '8081' })).toEqual([{ cmd: 'php artisan reverb:start --port=8081', port: '8081', label: 'Reverb' }])
  })

  it('leaves the workers to a site manager that runs them (Lerd), keeping the frontend', () => {
    const r = detectLaravelServe({ ...app, served: true, managedWorkers: true, scheduled: true, pkg: { scripts: { dev: 'vite' }, devDependencies: { vite: '^6' } } })
    expect(r.map(s => s.label)).toEqual(['Vite'])
  })

  it('runs no frontend for an API whose views never use Vite', () => {
    const pkg = { scripts: { dev: 'vite' }, devDependencies: { vite: '^5' } }
    expect(detectLaravelServe({ ...app, served: true, scheduled: true, pkg, usesVite: false }).map(s => s.label)).toEqual(['Queue', 'Scheduler'])
    expect(detectLaravelServe({ ...app, served: true, scheduled: true, pkg, usesVite: true }).map(s => s.label)).toEqual(['Queue', 'Scheduler', 'Vite'])
  })

  it('knows the commands Serve writes itself from one added by hand', () => {
    for (const c of ['php artisan serve --port=8000', 'herd php artisan queue:work', 'php artisan horizon', 'php artisan schedule:work', 'php artisan reverb:start --port=8081']) expect(isServeCommand(c)).toBe(true)
    for (const c of ['php artisan queue:work --queue=emails', 'npm run storybook', 'php artisan pail']) expect(isServeCommand(c)).toBe(false)
  })

  it('is empty for anything but a Laravel app', () => {
    expect(detectLaravelServe({ pkg: { scripts: { dev: 'nuxt dev' } } })).toEqual([])
  })
})
