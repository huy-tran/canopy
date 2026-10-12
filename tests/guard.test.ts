import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isInside, noShellMeta, safeId, safePullUrl, safeRef, safeRepo, safeSegment, webUrl } from '../electron/services/guard'

describe('webUrl', () => {
  it('lets http and https through', () => {
    expect(webUrl('https://github.com/a/b')).toBe('https://github.com/a/b')
    expect(webUrl('http://localhost:8000')).toBe('http://localhost:8000/')
  })
  it('refuses every other protocol', () => {
    for (const u of ['file:///C:/Windows/System32/calc.exe', 'ms-msdt:/id x', 'javascript:alert(1)', 'vscode://x', 'not a url', '']) expect(webUrl(u)).toBeNull()
  })
})

describe('safeRef', () => {
  it('takes normal branch names', () => {
    for (const r of ['main', 'feature/x-1', 'wt/session-1-abc', 'release_1.2', 'HEAD']) expect(safeRef(r)).toBe(r)
  })
  it('refuses names git could read as an option or path trick', () => {
    for (const r of ['--upload-pack=calc', '-D', '../x', 'a..b', 'x.lock', 'a/', '', 'a b', 'a;b', 5]) expect(() => safeRef(r)).toThrow()
  })
})

describe('safeSegment', () => {
  it('takes plain names and refuses separators and dots', () => {
    expect(safeSegment('session-1-abc')).toBe('session-1-abc')
    for (const s of ['..', '../x', 'a/b', 'a\b', '.hidden', '', 'a b']) expect(() => safeSegment(s)).toThrow()
  })
})

describe('noShellMeta', () => {
  it('refuses cmd.exe syntax', () => {
    for (const s of ['C:\a&calc', 'a|b', 'a>b', '50%', 'a"b', 'a^b', 'a\nb']) expect(() => noShellMeta(s)).toThrow()
    expect(noShellMeta('C:\Users\me\My Project (1)\file.ts')).toContain('My Project')
  })
})

describe('github values', () => {
  it('safeRepo', () => {
    expect(safeRepo('huy-tran/canopy')).toBe('huy-tran/canopy')
    for (const r of ['--repo', 'a/b/c', 'a', '-R/x', '']) expect(() => safeRepo(r)).toThrow()
  })
  it('safePullUrl', () => {
    expect(safePullUrl('https://github.com/a/b/pull/12')).toContain('/pull/12')
    for (const u of ['--web', 'https://evil.com/a/b/pull/1', 'https://github.com/a/b/issues/1', 'https://github.com/a/b/pull/1 --web']) expect(() => safePullUrl(u)).toThrow()
  })
  it('safeId', () => {
    expect(safeId(5)).toBe(5)
    for (const n of [0, -1, 1.5, '5', NaN]) expect(() => safeId(n)).toThrow()
  })
})

describe('isInside', () => {
  let root = '', outside = ''
  beforeAll(() => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-guard-'))
    root = path.join(base, 'root')
    outside = path.join(base, 'root-evil')
    fs.mkdirSync(root)
    fs.mkdirSync(outside)
    fs.writeFileSync(path.join(root, 'a.txt'), 'a')
    fs.writeFileSync(path.join(outside, 'secret.txt'), 's')
  })
  afterAll(() => fs.rmSync(path.dirname(root), { recursive: true, force: true }))

  it('accepts the folder and what is in it', () => {
    expect(isInside(root, root)).toBe(true)
    expect(isInside(root, path.join(root, 'a.txt'))).toBe(true)
    expect(isInside(root, path.join(root, 'new', 'file.txt'))).toBe(true)
  })
  it('refuses parents, siblings that share a prefix, and traversal', () => {
    expect(isInside(root, path.dirname(root))).toBe(false)
    expect(isInside(root, path.join(outside, 'secret.txt'))).toBe(false)
    expect(isInside(root, path.join(root, '..', 'root-evil', 'secret.txt'))).toBe(false)
  })
})
