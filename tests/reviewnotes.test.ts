import { describe, expect, it } from 'vitest'
import { notesPrompt, type ReviewNote } from '../shared/reviewnotes'

const note = (o: Partial<ReviewNote>): ReviewNote => ({ id: 'n', path: 'src/a.ts', line: '1', sign: '', code: '', text: 'Fix', ...o })

describe('notesPrompt', () => {
  it('is empty when there is nothing to send', () => {
    expect(notesPrompt([])).toBe('')
    expect(notesPrompt([note({ text: '  ' })])).toBe('')
  })

  it('lists comments by file, then line, with the line each one is on', () => {
    const text = notesPrompt([
      note({ path: 'src/b.ts', line: '3', sign: '+', code: '  const x = 1', text: 'Rename x' }),
      note({ path: 'src/a.ts', line: '20', text: 'Second' }),
      note({ path: 'src/a.ts', line: '4', sign: '-', code: 'old()', text: 'Why remove this?' }),
    ])
    expect(text).toContain('1. src/a.ts:4 (removed line, old numbering: `old()`)\n   Why remove this?')
    expect(text).toContain('2. src/a.ts:20 (line)\n   Second')
    expect(text).toContain('3. src/b.ts:3 (added line: `const x = 1`)\n   Rename x')
  })

  it('keeps a comment of several lines under its item, and shortens long code', () => {
    const text = notesPrompt([note({ code: 'x'.repeat(300), text: 'One\nTwo' })])
    expect(text).toContain('   One\n   Two')
    expect(text).toContain('x'.repeat(120) + '...`')
    expect(text).not.toContain('x'.repeat(121))
  })
})
