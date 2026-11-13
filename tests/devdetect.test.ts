import { describe, expect, it } from 'vitest'
import { detectDevServers, listeningPort } from '../shared/devdetect'

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
