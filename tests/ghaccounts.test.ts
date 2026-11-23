import { describe, expect, it } from 'vitest'
import { parseAccounts, pickAccount } from '../electron/services/ghaccounts'

const status = (rows: unknown[], host = 'github.com') => JSON.stringify({ hosts: { [host]: rows } })
const two = { list: ['work', 'home'], active: 'work' }

describe('parseAccounts', () => {
  it('lists the signed-in github.com accounts, the active one first', () => {
    const a = parseAccounts(status([
      { state: 'success', active: false, login: 'home' },
      { state: 'success', active: true, login: 'work' },
    ]))
    expect(a).toEqual({ list: ['work', 'home'], active: 'work' })
  })

  it('leaves out accounts whose sign-in is broken, and names that are not logins', () => {
    const a = parseAccounts(status([
      { state: 'error', active: true, login: 'expired' },
      { state: 'success', active: false, login: 'home' },
      { state: 'success', active: false, login: 'bad name;rm' },
    ]))
    expect(a).toEqual({ list: ['home'], active: '' })
  })

  it('is empty for other hosts, no sign-in, or output that is not JSON', () => {
    expect(parseAccounts(status([{ state: 'success', active: true, login: 'me' }], 'ghe.example.com'))).toEqual({ list: [], active: '' })
    expect(parseAccounts('{"hosts":{}}')).toEqual({ list: [], active: '' })
    expect(parseAccounts('unknown flag: --json')).toEqual({ list: [], active: '' })
    expect(parseAccounts('')).toEqual({ list: [], active: '' })
  })
})

describe('pickAccount', () => {
  const explicit = new Map([['acme/api', 'home']])
  const learned = new Map([['acme/api', 'work'], ['acme/web', 'home']])

  it('takes the project\'s choice over what was seen before, whatever the case of the name', () => {
    expect(pickAccount('Acme/API', two, explicit, learned)).toBe('home')
    expect(pickAccount('acme/web', two, explicit, learned)).toBe('home')
  })

  it('is empty for a repo nothing is known about', () => {
    expect(pickAccount('other/repo', two, explicit, learned)).toBe('')
  })

  it('ignores an account that is no longer signed in', () => {
    const onlyWork = { list: ['work'], active: 'work' }
    expect(pickAccount('acme/api', onlyWork, explicit, learned)).toBe('work')
    expect(pickAccount('acme/web', onlyWork, explicit, learned)).toBe('')
  })
})
