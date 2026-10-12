// Saved state, terminals, git, dev servers, history and one-shot Claude runs.
import { ipcMain } from 'electron'
import type { Persisted } from '../../shared/types'
import { errMessage } from '../../shared/errors'
import { handle, ptyData, send, store, trusted } from '../context'
import { startService, stopService } from '../services/devservers'
import { runClaude } from '../services/claude'
import * as git from '../services/git'
import { bufferOf, killSession, resizeSession, spawnSession, spawnShell, writeSession } from '../services/pty'
import { dayActivity, projectHistory, unwatchTranscript } from '../services/transcript'
import { listShells } from '../services/system'
import { planUsage } from '../services/usage'
import { applyLoginItem, applySummonKey, ensureTray } from '../tray'

export function registerWorkspaceIpc() {
  handle('state:load', () => store.get('state') ?? null)
  handle('state:save', (s: Persisted) => {
    store.set('state', s)
    ensureTray()
    applyLoginItem()
    applySummonKey(s.prefs?.summonKey ?? '')
  })

  handle('pty:spawn', o => spawnSession(o, ptyData, (id, code) => {
    unwatchTranscript(id)
    send('pty:exit', id, code)
  }))
  ipcMain.on('pty:write', (e, id: string, d: string) => { if (trusted(e)) writeSession(id, d) })
  ipcMain.on('pty:resize', (e, id: string, c: number, r: number) => { if (trusted(e)) resizeSession(id, c, r) })
  handle('pty:shell', async (o: { id: string; cwd: string; kind: string; cols: number; rows: number }) => {
    const shells = await listShells()
    const shell = shells.find(s => s.kind === o.kind) || shells[0]!
    return spawnShell({ ...o, shell }, ptyData, (id, code) => send('pty:exit', id, code))
  })
  handle('pty:kill', (id: string) => {
    unwatchTranscript(id)
    killSession(id)
  })
  handle('pty:buffer', (id: string) => bufferOf(id))

  handle('git:info', (p: string) => git.repoInfo(p))
  handle('git:status', (p: string) => git.status(p))
  handle('git:files', (p: string) => git.files(p))
  handle('git:diff', (p: string, f: string) => git.diff(p, f))
  handle('git:read', (p: string, f: string) => git.readFile(p, f))
  handle('git:worktreeAdd', (repo: string, base: string, slug: string) => git.worktreeAdd(repo, base, slug))
  handle('git:merge', async (repo: string, wt: string, branch: string, base: string) => {
    try {
      await git.mergeWorktree(repo, wt, branch, base)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: errMessage(e) }
    }
  })

  handle('svc:start', o => startService(o, {
    data: (id, d) => send('svc:data', id, d),
    status: (id, s, code) => send('svc:status', id, s, code),
  }))
  handle('svc:stop', (id: string) => stopService(id))

  handle('git:stage', (cwd: string, paths: string[]) => git.stage(cwd, paths))
  handle('git:unstage', (cwd: string, paths: string[]) => git.unstage(cwd, paths))
  handle('git:commit', (cwd: string, message: string, all: boolean) => git.commit(cwd, message, all))
  handle('git:sync', (cwd: string) => git.syncInfo(cwd))
  handle('git:push', (cwd: string) => git.push(cwd))
  handle('git:prUrl', (cwd: string) => git.pullRequestUrl(cwd))
  handle('git:draftMessage', async (cwd: string) => {
    const diff = await git.diffForMessage(cwd)
    if (!diff.trim()) return { ok: false, text: '', error: 'There are no changes to describe.' }
    return runClaude([
      'Write a git commit message for the changes below.',
      'Format: a subject line under 72 characters in the imperative mood, then optionally a blank line and at most three short lines of body.',
      'Say what changed, not why or how. No bullet lists, no file-by-file breakdown, no trailers, no co-author lines, no quotes or code fences.',
      'Never use em dashes or en dashes; use a plain hyphen. Reply with the message only.',
      '',
      diff,
    ].join('\n'))
  })

  handle('history', (repos: { id: string; path: string }[]) => projectHistory(repos))
  handle('summary:activity', async (repos: { id: string; path: string }[], since: number, until: number) => {
    const commits = (await Promise.all(repos.filter(r => r.path).map(async r => (await git.commitsBetween(r.path, since, until)).map(c => ({ ...c, repoId: r.id })))))
      .flat().sort((a, b) => a.at - b.at)
    return { sessions: await dayActivity(repos, since, until), commits }
  })
  handle('claude:run', (prompt: string) => runClaude(prompt))
  handle('usage', () => planUsage())
}
