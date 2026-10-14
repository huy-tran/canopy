import { describe, expect, it, vi } from 'vitest'
import { carryValues, sendValues, startValues } from '../app/utils/dispatch'
import { dispatchOf, inputsOf } from '../electron/services/github'
import type { GhWorkflowInput } from '../shared/types'

const input = (o: Partial<GhWorkflowInput> & { name: string }): GhWorkflowInput =>
  ({ description: '', required: false, default: '', type: 'string', options: [], ...o })

describe('dispatchOf: which workflows can be run by hand', () => {
  it('reads every form of the on: key', () => {
    expect(dispatchOf('on: workflow_dispatch')).toBeNull()
    expect(dispatchOf('on: [push, workflow_dispatch]')).toBeNull()
    expect(dispatchOf('on:\n  push:\n  workflow_dispatch:\n')).toBeNull()
    expect(dispatchOf('on:\n  workflow_dispatch: {}\n')).toEqual({})
    expect(dispatchOf('"on":\n  workflow_dispatch:\n')).toBeNull()
  })

  it('refuses a workflow with no workflow_dispatch trigger', () => {
    expect(dispatchOf('on: push')).toBeUndefined()
    expect(dispatchOf('on: [push, pull_request]')).toBeUndefined()
    expect(dispatchOf('on:\n  push:\n    branches: [main]\n')).toBeUndefined()
    expect(dispatchOf('name: no trigger\njobs: {}\n')).toBeUndefined()
  })

  it('hands back the inputs it declares', () => {
    const t = dispatchOf('on:\n  workflow_dispatch:\n    inputs:\n      version:\n        required: true\n')
    expect(t?.inputs).toEqual({ version: { required: true } })
  })
})

describe('inputsOf: what a workflow asks for', () => {
  const none = async () => [] as string[]

  it('knows all five input types and their defaults', async () => {
    const t = dispatchOf(`
on:
  workflow_dispatch:
    inputs:
      note: { description: Why, type: string, default: hi }
      dry: { type: boolean, default: true }
      count: { type: number, default: 5 }
      bump: { type: choice, required: true, options: [patch, minor, major], default: minor }
      target: { type: environment }
`)!
    const envs = vi.fn(async () => ['staging', 'production'])
    const got = await inputsOf(t, envs)
    expect(got.map(i => [i.name, i.type, i.default, i.required])).toEqual([
      ['note', 'string', 'hi', false], ['dry', 'boolean', 'true', false], ['count', 'number', '5', false],
      ['bump', 'choice', 'minor', true], ['target', 'environment', '', false],
    ])
    expect(got[0]!.description).toBe('Why')
    expect(got[3]!.options).toEqual(['patch', 'minor', 'major'])
    expect(got[4]!.options).toEqual(['staging', 'production'])
    expect(envs).toHaveBeenCalledTimes(1)
  })

  it('does not ask for environments unless an input needs them', async () => {
    const envs = vi.fn(none)
    await inputsOf(dispatchOf('on:\n  workflow_dispatch:\n    inputs:\n      a: { type: string }\n')!, envs)
    expect(envs).not.toHaveBeenCalled()
  })

  it('treats an input with no type, or one it does not know, as text', async () => {
    const got = await inputsOf(dispatchOf('on:\n  workflow_dispatch:\n    inputs:\n      a: {}\n      b: { type: sparkle }\n      c:\n')!, none)
    expect(got.map(i => [i.name, i.type, i.required, i.default])).toEqual([['a', 'string', false, ''], ['b', 'string', false, ''], ['c', 'string', false, '']])
  })

  it('turns numeric choices into text, and a workflow with no inputs into none', async () => {
    const got = await inputsOf(dispatchOf('on:\n  workflow_dispatch:\n    inputs:\n      n: { type: choice, options: [1, 2, 3] }\n')!, none)
    expect(got[0]!.options).toEqual(['1', '2', '3'])
    expect(await inputsOf(null, none)).toEqual([])
  })
})

describe('the form', () => {
  const inputs = [
    input({ name: 'version', required: true }),
    input({ name: 'bump', type: 'choice', options: ['patch', 'minor'] }),
    input({ name: 'dry', type: 'boolean' }),
    input({ name: 'env', type: 'environment', options: ['staging'] }),
    input({ name: 'count', type: 'number' }),
    input({ name: 'note', default: 'hello' }),
  ]

  it('starts at the default, else the first choice, else false for a boolean, else empty', () => {
    expect(startValues(inputs)).toEqual({ version: '', bump: 'patch', dry: 'false', env: 'staging', count: '', note: 'hello' })
  })

  it('leaves out an empty choice, number or environment, but sends empty text', () => {
    expect(sendValues(inputs, { version: '1.2.3', bump: '', dry: 'true', env: '', count: '', note: '' }))
      .toEqual({ version: '1.2.3', dry: 'true', note: '' })
  })

  it('sends every input that has a value', () => {
    const v = { version: '2.0.0', bump: 'minor', dry: 'false', env: 'staging', count: '3', note: 'x' }
    expect(sendValues(inputs, v)).toEqual(v)
  })

  it('keeps what was typed when the branch changes, and starts the new inputs at their default', () => {
    const next = [input({ name: 'version' }), input({ name: 'bump', type: 'choice', options: ['major', 'minor'] }), input({ name: 'fresh', default: 'new' })]
    // version stays, bump's old choice is gone so it starts again, note is no longer asked for.
    expect(carryValues(next, { version: '1.2.3', bump: 'patch', note: 'x' })).toEqual({ version: '1.2.3', bump: 'major', fresh: 'new' })
    expect(carryValues(next, { version: '1.2.3', bump: 'minor' })).toEqual({ version: '1.2.3', bump: 'minor', fresh: 'new' })
  })
})
