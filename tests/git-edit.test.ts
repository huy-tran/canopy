import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readForEdit, writeForEdit } from '../electron/services/git'

let dir = ''
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-edit-'))
  fs.mkdirSync(path.join(dir, '.git'))
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\r\ntwo\r\n')
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('editing files', () => {
  it('reads text with LF endings and remembers the original ones', () => {
    const r = readForEdit(dir, 'a.txt')
    expect(r).toMatchObject({ ok: true, text: 'one\ntwo\n', eol: '\r\n' })
  })

  it('saves with the original line endings', () => {
    const r = readForEdit(dir, 'a.txt')
    const w = writeForEdit(dir, 'a.txt', 'one\nthree\n', r.mtime!, r.eol!)
    expect(w.ok).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('one\r\nthree\r\n')
  })

  it('refuses when the file changed on disk meanwhile', () => {
    const r = readForEdit(dir, 'a.txt')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'other')
    fs.utimesSync(path.join(dir, 'a.txt'), new Date(), new Date(Date.now() + 5000))
    const w = writeForEdit(dir, 'a.txt', 'mine', r.mtime!, r.eol!)
    expect(w).toMatchObject({ ok: false, changed: true })
    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('other')
  })

  it('refuses paths outside the project and inside .git', () => {
    fs.writeFileSync(path.join(dir, '.git', 'config'), 'x')
    const m = fs.statSync(path.join(dir, '.git', 'config')).mtimeMs
    expect(writeForEdit(dir, '.git/config', 'y', m, '\n').ok).toBe(false)
    expect(writeForEdit(dir, '../escape.txt', 'y', 0, '\n').ok).toBe(false)
    expect(readForEdit(dir, '../escape.txt').ok).toBe(false)
  })

  it('does not edit binary files', () => {
    fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.from([1, 0, 2]))
    expect(readForEdit(dir, 'b.bin')).toMatchObject({ ok: false, error: 'Binary file.' })
  })
})
