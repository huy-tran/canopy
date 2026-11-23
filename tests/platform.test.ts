import { afterEach, describe, expect, it, vi } from 'vitest'

/** The module reads the platform once, when it loads. */
async function load(platform: string) {
  vi.resetModules()
  vi.stubGlobal('navigator', { platform })
  return import('../app/utils/platform')
}

afterEach(() => vi.unstubAllGlobals())

describe('joinPath', () => {
  it('writes a repo file with backslashes on Windows', async () => {
    const { joinPath } = await load('Win32')
    expect(joinPath('C:\\Work\\app', 'src/utils/a.ts')).toBe('C:\\Work\\app\\src\\utils\\a.ts')
    expect(joinPath('C:\\Work\\app\\', 'a.ts')).toBe('C:\\Work\\app\\a.ts')
    expect(joinPath('C:/Work/app/', 'a.ts')).toBe('C:/Work/app\\a.ts')
  })

  it('keeps forward slashes elsewhere', async () => {
    const { joinPath } = await load('Linux x86_64')
    expect(joinPath('/home/me/app', 'src/a.ts')).toBe('/home/me/app/src/a.ts')
    expect(joinPath('/home/me/app/', 'src/a.ts')).toBe('/home/me/app/src/a.ts')
  })
})
