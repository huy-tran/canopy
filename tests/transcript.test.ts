import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { encodeCwd, projectHistory } from '../electron/services/transcript'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-transcript-'))
const repo = path.join(home, 'work', 'my app')
const logs = (cwd: string) => path.join(home, '.claude', 'projects', encodeCwd(cwd))

const user = (text: string, timestamp: string) => ({ type: 'user', timestamp, gitBranch: 'feature/x', message: { role: 'user', content: text } })
const assistant = (id: string, timestamp: string, usage: Record<string, number>, model = 'claude-sonnet-4-6') =>
  ({ type: 'assistant', timestamp, uuid: `u-${id}-${timestamp}`, message: { id, model, role: 'assistant', content: [{ type: 'text', text: 'ok' }], usage } })
const write = (dir: string, name: string, lines: unknown[]) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, name), lines.map(l => JSON.stringify(l)).join('\n') + '\n')
}

beforeAll(() => {
  vi.spyOn(os, 'homedir').mockReturnValue(home)
  write(logs(repo), 'aaaa-1111.jsonl', [
    user('Add the export button', '2026-11-20T09:00:00.000Z'),
    // The same message is logged again as it grows: only its last line counts.
    assistant('m1', '2026-11-20T09:00:05.000Z', { input_tokens: 100, output_tokens: 10 }),
    assistant('m1', '2026-11-20T09:00:06.000Z', { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 2_000_000, cache_creation_input_tokens: 400_000 }),
    'not json at all',
    user('Now add tests', '2026-11-20T09:10:00.000Z'),
    assistant('m2', '2026-11-20T09:10:30.000Z', { input_tokens: 0, output_tokens: 1_000_000 }, 'claude-opus-5-5'),
  ])
  // A worktree of the repo, and a log with no assistant message, which is not a session yet.
  write(logs(`${repo}.worktrees${path.sep}session-1-abc`), 'bbbb-2222.jsonl', [
    user('Fix the flaky test', '2026-11-21T10:00:00.000Z'),
    assistant('w1', '2026-11-21T10:00:10.000Z', { input_tokens: 1_000_000, output_tokens: 0 }),
  ])
  write(logs(repo), 'cccc-3333.jsonl', [user('Hello', '2026-11-22T10:00:00.000Z')])
  // Another repo whose folder name only starts the same way.
  write(logs(`${repo} two`), 'dddd-4444.jsonl', [assistant('x1', '2026-11-22T10:00:00.000Z', { input_tokens: 5, output_tokens: 5 })])
})

afterAll(() => {
  vi.restoreAllMocks()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('encodeCwd', () => {
  it('replaces everything but letters and digits, as Claude Code names its log folders', () => {
    expect(encodeCwd('C:\\Users\\me\\my app.v2')).toBe('C--Users-me-my-app-v2')
    expect(encodeCwd('/home/me/app')).toBe('-home-me-app')
  })
})

describe('projectHistory', () => {
  it('reads a repo\'s sessions and its worktrees\', newest first, and nothing from other folders', async () => {
    const list = await projectHistory([{ id: 'r1', path: repo }, { id: 'none', path: '' }])
    expect(list.map(h => h.claudeId)).toEqual(['bbbb-2222', 'aaaa-1111'])
    expect(list.every(h => h.repoId === 'r1')).toBe(true)
  })

  it('sums tokens once per message and prices each message by its own model', async () => {
    const [, h] = await projectHistory([{ id: 'r1', path: repo }])
    expect(h).toMatchObject({ title: 'Now add tests', branch: 'feature/x', tokIn: 1_000_000, tokOut: 1_100_000, cacheR: 2_000_000, cacheW: 400_000 })
    expect(h!.start).toBe(Date.parse('2026-11-20T09:00:00.000Z'))
    expect(h!.end).toBe(Date.parse('2026-11-20T09:10:30.000Z'))
    // Sonnet 4.6: 3 in + 1.5 out + 0.6 cache read + 1.5 cache write. Opus 5.5: 20 out.
    expect(h!.cost).toBeCloseTo(6.6 + 20, 6)
    expect(Object.values(h!.days).reduce((a, b) => a + b, 0)).toBeCloseTo(h!.cost, 6)
  })
})
