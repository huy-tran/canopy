import { describe, expect, it } from 'vitest'
import { canFocus, pickFocused } from '../app/utils/focus'

const panes = [{ id: 's0' }, { id: 's1' }, { id: 's2' }]

describe('pickFocused', () => {
  it('keeps the pane the project had focused', () => {
    expect(pickFocused(panes, 's1')).toBe('s1')
  })

  it('falls back to the first pane when nothing is stored', () => {
    expect(pickFocused(panes, null)).toBe('s0')
    expect(pickFocused(panes, undefined)).toBe('s0')
  })

  it('falls back to the first pane when the stored id is not a pane, such as a docked shell', () => {
    // This is why a docked shell must never be stored: the active session would jump back to the first.
    expect(pickFocused(panes, 'dock-shell')).toBe('s0')
  })

  it('is null when the project has no panes', () => {
    expect(pickFocused([], 's1')).toBeNull()
  })
})

describe('canFocus', () => {
  it('lets panes take the focus', () => {
    expect(canFocus({ docked: false })).toBe(true)
  })

  it('stops docked shells taking it from the active session', () => {
    expect(canFocus({ docked: true })).toBe(false)
  })

  it('lets an id the store does not know through', () => {
    expect(canFocus(undefined)).toBe(true)
  })
})
