import { describe, expect, it } from 'vitest'
import { clampInt, escapeHtml, plain } from '../app/utils/html'

describe('escapeHtml', () => {
  it('escapes everything that can open a tag or leave an attribute', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;')
  })
})

describe('plain', () => {
  it('copies without sharing', () => {
    const a = { x: [1, 2] }
    const b = plain(a)
    b.x.push(3)
    expect(a.x).toEqual([1, 2])
  })
})

describe('clampInt', () => {
  it('limits and rounds', () => {
    expect(clampInt(5.6, 0, 10)).toBe(6)
    expect(clampInt(-3, 0, 10)).toBe(0)
    expect(clampInt(30, 0, 10)).toBe(10)
  })
})
