import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { files } from '../electron/services/git'

const dirs: string[] = []
const temp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-files-'))
  dirs.push(d)
  return d
}
const put = (root: string, rel: string, text = 'x') => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
  fs.writeFileSync(path.join(root, rel), text)
}

afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
})

describe('files() in a git repo', () => {
  let repo = ''
  beforeAll(() => {
    repo = temp()
    execFileSync('git', ['init', '-q'], { cwd: repo })
    put(repo, '.gitignore', '.env*\nnode_modules/\n.vscode/\n')
    put(repo, 'a.txt')
    put(repo, 'src/b.ts')
    put(repo, '.env')
    put(repo, 'api/.env.local')
    put(repo, 'node_modules/pkg/x.js')
    put(repo, '.vscode/settings.json')
    execFileSync('git', ['add', '.gitignore', 'a.txt'], { cwd: repo })
  })

  it('lists tracked and untracked files without the ignored ones', async () => {
    expect(await files(repo)).toEqual(['.gitignore', 'a.txt', 'src/b.ts'])
  })

  it('adds ignored files such as .env when asked', async () => {
    expect(await files(repo, { ignored: true })).toEqual(['.env', '.gitignore', 'a.txt', 'api/.env.local', 'src/b.ts'])
  })

  it('leaves out ignored folders however it is asked', async () => {
    const all = await files(repo, { ignored: true })
    expect(all.some(f => f.startsWith('node_modules/') || f.startsWith('.vscode/'))).toBe(false)
    expect(all.some(f => f.endsWith('/'))).toBe(false)
  })
})

describe('files() in a folder that is not a repo', () => {
  let dir = ''
  let outside = ''
  beforeAll(() => {
    dir = temp()
    outside = temp()
    put(dir, 'a.txt')
    put(dir, '.env')
    put(dir, 'src/b.ts')
    put(dir, 'node_modules/pkg/x.js')
    put(dir, '.git/config')
    put(dir, 'dist/app.js')
    put(outside, 'secret.txt')
    // A junction on Windows, a symlink elsewhere: neither may lead out of the folder.
    fs.symlinkSync(outside, path.join(dir, 'link'), 'junction')
  })

  it('lists the files on disk, dotfiles included, with "/" paths', async () => {
    expect(await files(dir)).toEqual(['.env', 'a.txt', 'src/b.ts'])
  })

  it('gives the same list whether or not ignored files are asked for', async () => {
    expect(await files(dir, { ignored: true })).toEqual(await files(dir))
  })

  it('gives nothing for a folder that does not exist', async () => {
    expect(await files(path.join(dir, 'missing'))).toEqual([])
  })
})
