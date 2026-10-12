import { describe, expect, it } from 'vitest'
import { errMessage } from '../shared/errors'

describe('errMessage', () => {
  it('reads whatever was thrown', () => {
    expect(errMessage(new Error('boom'))).toBe('boom')
    expect(errMessage({ message: 'plain object' })).toBe('plain object')
    expect(errMessage('text')).toBe('text')
    expect(errMessage(null)).toBe('null')
  })
})
