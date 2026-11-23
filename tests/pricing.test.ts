import { describe, expect, it } from 'vitest'
import { contextOf, costOf, isPriced, modelLabel, priceOf } from '../shared/pricing'

describe('priceOf', () => {
  it('matches the most specific row for a model id', () => {
    expect(priceOf('claude-opus-5-5-20261001')).toMatchObject({ in: 4, out: 20 })
    expect(priceOf('claude-opus-5-20260101')).toMatchObject({ in: 5, out: 25 })
    expect(priceOf('claude-opus-4-1')).toMatchObject({ in: 15, out: 75, ctx: 200_000 })
    expect(priceOf('CLAUDE-SONNET-4-6')).toMatchObject({ in: 3, out: 15 })
  })

  it('guesses from the family for an id it has no row for, then falls back', () => {
    expect(priceOf('claude-opus-9')).toMatchObject({ in: 5, out: 25 })
    expect(priceOf('some-haiku-model')).toMatchObject({ in: 1, out: 5 })
    expect(priceOf('mystery')).toMatchObject({ in: 3, out: 15 })
    expect(priceOf('')).toMatchObject({ in: 3, out: 15 })
  })

  it('derives cache prices from the input price unless a row sets the read price', () => {
    expect(priceOf('claude-sonnet-4-6').cacheW).toBeCloseTo(3.75, 9)
    expect(priceOf('claude-sonnet-4-6').cacheR).toBeCloseTo(0.3, 9)
    expect(priceOf('claude-fable-5-2')).toMatchObject({ cacheW: 12.5, cacheR: 0.25 })
  })
})

describe('isPriced', () => {
  it('is true only for ids with a row of their own', () => {
    expect(isPriced('claude-fable-5-2')).toBe(true)
    expect(isPriced('claude-opus-9')).toBe(false)
    expect(isPriced('Sonnet 4.6')).toBe(false)
    expect(isPriced('')).toBe(false)
  })
})

describe('costOf', () => {
  it('prices each kind of token per million', () => {
    const u = { tokIn: 1_000_000, tokOut: 1_000_000, cacheR: 1_000_000, cacheW: 1_000_000 }
    expect(costOf('claude-sonnet-4-6', u)).toBeCloseTo(3 + 15 + 0.3 + 3.75, 6)
    expect(costOf('claude-sonnet-4-6', { tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0 })).toBe(0)
  })
})

describe('contextOf', () => {
  it('is the model window, or 1M when the id says so', () => {
    expect(contextOf('claude-opus-4-5')).toBe(200_000)
    expect(contextOf('claude-opus-4-5[1m]')).toBe(1_000_000)
    expect(contextOf('claude-sonnet-5')).toBe(1_000_000)
  })
})

describe('modelLabel', () => {
  it('turns a model id into the name shown', () => {
    expect(modelLabel('claude-sonnet-4-6')).toBe('Sonnet 4.6')
    expect(modelLabel('claude-opus-4-20250514')).toBe('Opus 4')
    expect(modelLabel('claude-3-5-haiku-20241022')).toBe('Haiku 3.5')
    expect(modelLabel('claude-fable-5-2')).toBe('Fable 5.2')
    expect(modelLabel('gpt')).toBe('gpt')
    expect(modelLabel('')).toBe('')
  })
})
