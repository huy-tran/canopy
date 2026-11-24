import { describe, expect, it } from 'vitest'
import { entryFor, entrySecured, folderName, isParked, lerdRunsWorkers, mentionsPath, norm, siteUrl } from '../shared/sites'

describe('paths', () => {
  it('compares Windows, JSON-escaped and POSIX spellings of one folder', () => {
    expect(norm('C:\\Users\\Huy\\Herd\\App\\')).toBe('c:/users/huy/herd/app')
    expect(norm('C:\\\\Users\\\\Huy\\\\Herd\\\\App')).toBe('c:/users/huy/herd/app')
    expect(norm('/home/huy/Sites/app/')).toBe('/home/huy/sites/app')
  })

  it('names a site after its folder', () => {
    expect(folderName('C:\\Users\\Huy\\Herd\\Aipc-Events')).toBe('aipc-events')
    expect(folderName('/home/huy/sites/my-app/')).toBe('my-app')
  })

  it('knows a folder inside a parked one, and not one two levels down', () => {
    expect(isParked('C:\\Users\\Huy\\Herd\\app', ['C:\\Users\\Huy\\Herd'])).toBe(true)
    expect(isParked('C:\\Users\\Huy\\Herd\\app\\sub', ['C:\\Users\\Huy\\Herd'])).toBe(false)
    expect(isParked('C:\\Users\\Huy\\Frontend\\canopy', ['C:\\Users\\Huy\\Herd'])).toBe(false)
  })

  it('finds a whole path in a file, not the start of a longer one', () => {
    expect(mentionsPath('"paths": ["C:\\\\Users\\\\Huy\\\\Herd\\\\app"]', 'C:\\Users\\Huy\\Herd\\app')).toBe(true)
    expect(mentionsPath('path: /home/huy/sites/app-2', '/home/huy/sites/app')).toBe(false)
    expect(mentionsPath('path: /home/huy/sites/app', '/home/huy/sites/app')).toBe(true)
  })
})

describe('Lerd registry', () => {
  const yaml = [
    'sites:',
    '  - name: shop',
    '    path: /home/huy/code/shop',
    '    secured: true',
    '  - name: blog',
    '    path: /home/huy/code/blog',
    '',
  ].join('\n')

  it('finds the entry that lists a folder, and whether it is secured', () => {
    expect(entrySecured(entryFor(yaml, '/home/huy/code/shop'))).toBe(true)
    expect(entrySecured(entryFor(yaml, '/home/huy/code/blog'))).toBe(false)
    expect(entryFor(yaml, '/home/huy/code/other')).toBe('')
  })

  it('reads a project\'s workers from .lerd.yaml', () => {
    expect(lerdRunsWorkers('php_version: "8.4"\nworkers:\n  - horizon\n  - schedule\n')).toBe(true)
    expect(lerdRunsWorkers('workers: [queue]\n')).toBe(true)
    expect(lerdRunsWorkers('php_version: "8.4"\nworkers:\n')).toBe(false)
    expect(lerdRunsWorkers('php_version: "8.4"\n')).toBe(false)
  })
})

describe('siteUrl', () => {
  it('is http unless the site is secured', () => {
    expect(siteUrl(false, 'app', 'test')).toBe('http://app.test')
    expect(siteUrl(true, 'app', 'test')).toBe('https://app.test')
  })
})
