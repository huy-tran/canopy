import { describe, expect, it } from 'vitest'
import { markdown } from '../app/utils/markdown'

describe('markdown', () => {
  it('never lets HTML through', () => {
    const out = markdown('<script>alert(1)</script> <img src=x onerror=alert(1)>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
  })
  it('keeps a link target inside its attribute', () => {
    const out = markdown('[x](https://a.com/" onmouseover="alert(1))')
    expect(out).not.toMatch(/<a [^>]*onmouseover=/)
  })
  it('escapes code blocks', () => {
    expect(markdown('```\n<b>hi</b>\n```')).toContain('&lt;b&gt;hi&lt;/b&gt;')
  })
})
