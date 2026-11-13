// Reads a project folder for shared/devdetect.ts: which dev server it runs.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { detectDevServers, type DetectedServer } from '../../shared/devdetect'

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

export async function detectServers(dir: string): Promise<DetectedServer[]> {
  if (typeof dir !== 'string' || !dir) return []
  const has = (n: string) => fs.existsSync(path.join(dir, n))
  return detectDevServers({
    pkg: json(path.join(dir, 'package.json')),
    composer: json(path.join(dir, 'composer.json')),
    artisan: has('artisan'),
    locks: ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'package-lock.json'].filter(has),
    herd: await hasHerd(),
  })
}
