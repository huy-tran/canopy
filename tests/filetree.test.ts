import { describe, expect, it } from 'vitest'
import { fuzzy, hiSegs, treeRows } from '../app/utils/fileTree'

describe('fuzzy', () => {
  it('matches letters in order and reports where', () => {
    expect(fuzzy('ab', 'src/a_b.ts')!.idx).toEqual([4, 6])
    expect(fuzzy('ba', 'src/a_b.ts')).toBeNull()
    expect(fuzzy('a b', 'src/a_b.ts')!.idx).toEqual([4, 6])
  })

  it('prefers a match in the file name over one spread across the folders', () => {
    const inName = fuzzy('store', 'app/stores/ui.ts')!
    const exact = fuzzy('store', 'app/store.ts')!
    expect(exact.score).toBeGreaterThan(inName.score)
    expect(exact.idx).toEqual([4, 5, 6, 7, 8])
  })

  it('falls back to the whole path when the name alone does not match', () => {
    expect(fuzzy('appui', 'app/stores/ui.ts')!.idx).toEqual([0, 1, 2, 11, 12])
  })

  it('scores runs and starts of words higher', () => {
    expect(fuzzy('ui', 'x/ui.ts')!.score).toBeGreaterThan(fuzzy('ui', 'x/quit.ts')!.score)
  })
})

describe('hiSegs', () => {
  it('cuts text into matched and unmatched runs', () => {
    expect(hiSegs('store.ts', 4, new Set([4, 5, 9]), 'c', 400)).toEqual([
      { t: 'st', color: 'var(--lnk)', w: 700 },
      { t: 'ore', color: 'c', w: 400 },
      { t: '.', color: 'var(--lnk)', w: 700 },
      { t: 'ts', color: 'c', w: 400 },
    ])
  })

  it('is one plain run without a match, and nothing for empty text', () => {
    expect(hiSegs('a.ts', 0, null, 'c', 500)).toEqual([{ t: 'a.ts', color: 'c', w: 500 }])
    expect(hiSegs('', 0, null, 'c', 500)).toEqual([])
  })
})

describe('treeRows', () => {
  const files = ['README.md', 'src/b.ts', 'src/a.ts', 'src/utils/x.ts', 'app/z.ts']

  it('lists folders first, then files by name, all closed', () => {
    expect(treeRows(files, []).map(r => `${r.depth}:${r.path}${r.dir ? '/' : ''}`)).toEqual(['0:app/', '0:src/', '0:README.md'])
  })

  it('shows what is inside open folders only, one level deeper each', () => {
    expect(treeRows(files, ['src']).map(r => `${r.depth}:${r.name}`)).toEqual(['0:app', '0:src', '1:utils', '1:a.ts', '1:b.ts', '0:README.md'])
    expect(treeRows(files, ['src', 'src/utils']).map(r => r.path)).toContain('src/utils/x.ts')
    // An open folder inside a closed one stays hidden.
    expect(treeRows(files, ['src/utils']).map(r => r.path)).not.toContain('src/utils/x.ts')
  })
})
