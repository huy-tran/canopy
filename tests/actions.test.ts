import { describe, expect, it } from 'vitest'
import { ACTIONS, clashes, comboOf, keysOf, matchAction, matchActions, RESERVED } from '../shared/actions'

const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, ...mods })
const action = (id: string) => ACTIONS.find(a => a.id === id)!

describe('comboOf', () => {
  it('names a key press with its modifiers in a fixed order', () => {
    expect(comboOf(key('KeyP', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+P')
    expect(comboOf(key('Digit3', { altKey: true }))).toBe('Alt+3')
    expect(comboOf(key('Numpad7'))).toBe('7')
    expect(comboOf(key('ArrowLeft', { ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+←')
    expect(comboOf(key('NumpadEnter', { ctrlKey: true }))).toBe('Ctrl+Enter')
    expect(comboOf(key('F5'))).toBe('F5')
  })

  it('is null for a modifier alone and for keys it has no name for', () => {
    expect(comboOf(key('ShiftLeft', { shiftKey: true }))).toBeNull()
    expect(comboOf(key('ControlRight', { ctrlKey: true }))).toBeNull()
    expect(comboOf(key('IntlBackslash'))).toBeNull()
    expect(comboOf(key(''))).toBeNull()
  })
})

describe('keysOf', () => {
  it('uses the defaults until the user rebinds, and an empty list means unbound', () => {
    expect(keysOf({}, 'commands')).toEqual(['Ctrl+K'])
    expect(keysOf({ commands: ['Ctrl+J'] }, 'commands')).toEqual(['Ctrl+J'])
    expect(keysOf({ commands: [] }, 'commands')).toEqual([])
    expect(keysOf({}, 'no-such-action')).toEqual([])
  })
})

describe('matchAction', () => {
  it('finds app-wide actions by default and scoped ones only in their scope', () => {
    expect(matchAction({}, 'Ctrl+K')).toBe('commands')
    expect(matchAction({}, 'Ctrl+K', 'aws')).toBe('awsFinder')
    expect(matchAction({}, 'J')).toBeNull()
    expect(matchAction({}, 'J', 'github')).toBe('ghDown')
    expect(matchAction({}, null)).toBeNull()
  })

  it('follows the user\'s bindings', () => {
    const keys = { commands: ['Ctrl+J'] }
    expect(matchAction(keys, 'Ctrl+J')).toBe('commands')
    expect(matchAction(keys, 'Ctrl+K')).toBeNull()
  })
})

describe('matchActions', () => {
  it('returns every AWS action on a key, since services share keys', () => {
    const ids = matchActions({}, 'D', 'aws')
    expect(ids).toContain('awsBookmarkRemove')
    expect(ids).toContain('awsEbDeploy')
    expect(matchActions({}, null, 'aws')).toEqual([])
  })
})

describe('clashes', () => {
  it('never clashes across scopes, always within one, except two different AWS services', () => {
    expect(clashes(action('commands'), action('awsFinder'))).toBe(false)
    expect(clashes(action('ghDown'), action('ghUp'))).toBe(true)
    expect(clashes(action('awsEbDeploy'), action('awsBookmarkRemove'))).toBe(false)
    expect(clashes(action('awsEc2Stop'), action('awsEc2Start'))).toBe(true)
    expect(clashes(action('awsDown'), action('awsEc2Stop'))).toBe(true)
  })
})

describe('the default bindings', () => {
  it('have unique ids', () => {
    expect(new Set(ACTIONS.map(a => a.id)).size).toBe(ACTIONS.length)
  })

  it('never put two clashing actions on one key', () => {
    const found: string[] = []
    ACTIONS.forEach((a, i) => ACTIONS.slice(i + 1).forEach((b) => {
      if (clashes(a, b)) a.def.filter(k => b.def.includes(k)).forEach(k => found.push(`${k}: ${a.id} and ${b.id}`))
    }))
    expect(found).toEqual([])
  })

  it('leave the keys Claude Code needs alone in app-wide actions', () => {
    const taken = ACTIONS.filter(a => !a.scope).flatMap(a => a.def.filter(k => k in RESERVED).map(k => `${k}: ${a.id}`))
    expect(taken).toEqual([])
  })
})
