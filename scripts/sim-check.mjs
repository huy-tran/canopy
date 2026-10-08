// Renders the workspace simulation with made-up data in a headless browser and saves screenshots
// of its main views to .sim-check/, so layout problems show before a release. Fails on script errors.
//   npm run sim:check            all views
//   npm run sim:check -- stage   only the views whose name contains "stage"
// Uses Chrome or Edge; set CHROME to a browser's path to use another.
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, '.sim-check')
fs.mkdirSync(out, { recursive: true })

const VIEWS = [
  { name: 'workspace-day', q: 'view=all&hour=13&fast=10' },
  { name: 'workspace-night', q: 'view=all&hour=23&fast=10' },
  { name: 'workspace-rain-dusk', q: 'view=all&hour=18&sky=rain&fast=10' },
  { name: 'workspace-snow', q: 'view=all&hour=10&sky=snow&fast=10' },
  { name: 'stage', q: 'view=stage&hour=21&fast=10' },
  { name: 'desks', q: 'view=desks&hour=15' },
  { name: 'reactions', q: 'view=react&hour=15' },
]

const browser = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p))
if (!browser) {
  console.error('No Chrome or Edge found. Set CHROME to a Chromium browser.')
  process.exit(1)
}

await build({
  entryPoints: [path.join(root, 'scripts/sim-check/harness.ts')],
  bundle: true,
  outfile: path.join(out, 'harness.js'),
  format: 'iife',
  logLevel: 'error',
  alias: { '#shared': path.join(root, 'shared'), '~': path.join(root, 'app') },
})
// The name tags and speech bubbles are styled in the view; borrow its stylesheet.
const css = /<style>([\s\S]*?)<\/style>/.exec(fs.readFileSync(path.join(root, 'app/components/SimulationView.vue'), 'utf8'))?.[1] || ''
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:system-ui}${css}</style></head><body><div id="c" style="position:relative;width:1400px;height:900px"></div><script src="harness.js"></script></body></html>`)

const only = process.argv[2]
let failed = false
for (const v of VIEWS.filter(v => !only || v.name.includes(only))) {
  const file = path.join(out, `${v.name}.png`)
  const r = spawnSync(browser, [
    '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files',
    '--hide-scrollbars', '--window-size=1400,900', '--virtual-time-budget=6000', '--enable-logging=stderr', '--v=0',
    `--user-data-dir=${path.join(out, 'profile')}`, `--screenshot=${file}`, `${pathToFileURL(path.join(out, 'index.html'))}?${v.q}`,
  ], { encoding: 'utf8', timeout: 120_000 })
  const errors = (r.stderr || '').split('\n').filter(l => /Uncaught|CONSOLE.*error/i.test(l))
  if (errors.length || !fs.existsSync(file)) {
    failed = true
    console.error(`✗ ${v.name}\n  ${errors.join('\n  ') || 'no screenshot'}`)
  } else {
    console.log(`✓ ${v.name}  ${path.relative(root, file)}`)
  }
}
process.exit(failed ? 1 : 0)
