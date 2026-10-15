import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandLine, findOnPath, posixShell } from '../electron/services/shellcmd'

describe('commandLine', () => {
  it('goes through cmd.exe on Windows, as one raw string', () => {
    expect(commandLine('claude --x "a b"', 'win32', { ComSpec: 'C:\Windows\System32\cmd.exe' })).toEqual({ file: 'C:\Windows\System32\cmd.exe', args: '/d /s /c "claude --x "a b""' })
    expect(commandLine('npm run dev', 'win32', {}).file).toBe('cmd.exe')
  })
  it('goes through a login, interactive shell elsewhere', () => {
    const sh = commandLine('npm run dev', 'linux', { SHELL: '/bin/sh' })
    expect(sh.args).toEqual(['-l', '-i', '-c', 'npm run dev'])
  })
})

describe('posixShell', () => {
  it('takes SHELL when it is a real file and /bin/sh otherwise', () => {
    expect(posixShell({ SHELL: '/definitely/not/here' })).toBe('/bin/sh')
    expect(posixShell({})).toBe('/bin/sh')
    expect(posixShell({ SHELL: 'bash' })).toBe('/bin/sh')
  })
})

describe('findOnPath', () => {
  let dir = ''
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-path-'))
    fs.writeFileSync(path.join(dir, 'tool'), '#!/bin/sh\n', { mode: 0o755 })
    fs.mkdirSync(path.join(dir, 'folder'))
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('finds a program in a PATH folder', () => {
    if (process.platform === 'win32') return
    expect(findOnPath('tool', { PATH: `/nope:${dir}` })).toBe(`${dir}/tool`)
  })
  it('ignores folders and missing names', () => {
    expect(findOnPath('folder', { PATH: dir })).toBeUndefined()
    expect(findOnPath('missing', { PATH: dir })).toBeUndefined()
    expect(findOnPath('tool', { PATH: '' })).toBeUndefined()
  })
})
