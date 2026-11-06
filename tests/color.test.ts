import { describe, expect, it } from 'vitest'
import { checksum, hueGap, hueOf, MIN_HUE_GAP } from '../shared/color'

describe('hueOf', () => {
  it('is the same for the same name, whatever the case or spacing', () => {
    expect(hueOf('Acme Payments')).toBe(hueOf('  acme payments '))
    expect(checksum('a')).toBe(checksum('a'))
  })
  it('gives a hue on the wheel, and different names usually differ', () => {
    const names = ['Acme Payments', 'Kindred', 'Corporate Tailors', 'Field App', 'Canopy', 'Bower', 'The Perfect Pitch']
    const hues = names.map(n => hueOf(n))
    for (const h of hues) expect(h).toBeGreaterThanOrEqual(0)
    for (const h of hues) expect(h).toBeLessThan(360)
    expect(new Set(hues).size).toBeGreaterThan(5)
  })
  it('keeps a new project clear of the others, strictly for a dozen and as far as it can after that', () => {
    const taken: number[] = []
    for (let i = 0; i < 24; i++) {
      const h = hueOf(`project ${i}`, taken)
      const gap = Math.min(...taken.map(t => hueGap(h, t)), 180)
      expect(gap).toBeGreaterThanOrEqual(i < 12 ? MIN_HUE_GAP : 6)
      taken.push(h)
    }
  })
  it('still answers when the wheel is full', () => {
    const taken = Array.from({ length: 36 }, (_, i) => i * 10)
    const h = hueOf('one more', taken)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(360)
  })
  it('measures gaps round the wheel', () => {
    expect(hueGap(350, 10)).toBe(20)
    expect(hueGap(0, 180)).toBe(180)
  })
})
