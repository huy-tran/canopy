// Bundles the Electron main and preload scripts to CommonJS.
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron', 'node-pty', 'electron-updater'],
  logLevel: 'warning',
}

await build({ ...common, entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' } })
console.log('Built dist-electron/main.cjs and preload.cjs')
