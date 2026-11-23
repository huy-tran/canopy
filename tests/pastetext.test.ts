import { describe, expect, it, vi } from 'vitest'

// The module builds on xterm, which needs a browser; only its pure helper is under test.
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class {} }))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }))
vi.mock('../app/utils/bridge', () => ({ api: {} }))

const { pasteText } = await import('../app/utils/terminals')

describe('pasteText', () => {
  it('keeps text, tabs and line breaks', () => {
    expect(pasteText('a\tb\r\nc\rd\ne')).toBe('a\tb\nc\nd\ne')
  })

  it('drops escape sequences, so a prompt cannot end the paste and type keys of its own', () => {
    expect(pasteText('do this\x1b[201~\r1\r')).toBe('do this[201~\n1\n')
    expect(pasteText('x\x9b201~y\x00\x07\x7f')).toBe('x201~y')
  })
})
