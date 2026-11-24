import { describe, expect, it } from 'vitest'
import { inServeScope, ownedAddress, pickTarget } from '../shared/serve'

const api = { id: 'api', site: 'http://api.test', frontend: false }
const web = { id: 'web', site: '', frontend: true }
const admin = { id: 'admin', site: '', frontend: true }
const docs = { id: 'docs', site: '', frontend: false }

describe('pickTarget', () => {
  it('takes the focused repo', () => {
    expect(pickTarget([api, web, admin], 'admin')?.id).toBe('admin')
    expect(pickTarget([web, api], 'api')?.id).toBe('api')
  })

  it('prefers a frontend to a Laravel site when nothing is focused', () => {
    expect(pickTarget([api, web, admin])?.id).toBe('web')
  })

  it('falls back to the site, and skips a repo with neither', () => {
    expect(pickTarget([docs, api])?.id).toBe('api')
    expect(pickTarget([docs], 'docs')).toBeNull()
  })

  it('ignores a focused repo that has nothing to show', () => {
    expect(pickTarget([web, docs], 'docs')?.id).toBe('web')
  })
})

describe('inServeScope', () => {
  it('runs everything when no repo is chosen', () => {
    expect(inServeScope('npm run dev', false, false)).toBe(true)
  })

  it('runs the chosen repo whole, and only a backend\'s workers beside it', () => {
    expect(inServeScope('yarn dev', true, true)).toBe(true)
    expect(inServeScope('yarn dev', false, true)).toBe(false)
    expect(inServeScope('herd php artisan queue:work', false, true)).toBe(true)
  })
})

describe('ownedAddress', () => {
  const sites = ['http://api.test']
  it('knows a repo site and a local port of the project\'s servers', () => {
    expect(ownedAddress('http://api.test/', sites, [])).toBe(true)
    expect(ownedAddress('http://localhost:5173/', sites, ['5173'])).toBe(true)
  })

  it('leaves an address typed by hand alone', () => {
    expect(ownedAddress('https://example.com/', sites, ['5173'])).toBe(false)
    expect(ownedAddress('http://localhost:9999/', sites, ['5173'])).toBe(false)
    expect(ownedAddress('nonsense', sites, [])).toBe(false)
  })
})
