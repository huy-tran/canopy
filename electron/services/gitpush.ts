// `git push` in a pty, so ssh can ask for a key's passphrase (or a password) the way it does in a terminal, and Canopy asks the user.
// A plain child process has no terminal, so ssh would just fail with "Permission denied" for a key that has a passphrase.
import * as pty from 'node-pty'
import { execFile } from 'node:child_process'
import { cleanEnv, CONPTY } from './pty'
import { IS_WIN } from './shellcmd'
import { failureText, promptOf, type GitPrompt } from '../../shared/gitprompt'

/** Gives the secret typed for a prompt, or null when the user cancelled. */
export type Ask = (p: Exclude<GitPrompt, { kind: 'hostkey' }>) => Promise<string | null>

/** A push with nothing said and nothing asked for this long is stuck (a dead network, an unrecognised question). */
const QUIET_MS = 60_000
/** Questions answered in one push: a wrong passphrase is asked again by ssh, but not forever. */
const MAX_ASKS = 3

function kill(p: pty.IPty) {
  if (!IS_WIN) {
    try { p.kill() } catch { /* Already gone. */ }
    return
  }
  execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], { windowsHide: true }, () => {
    try { p.kill() } catch { /* Already gone. */ }
  })
}

export function pushInPty(cwd: string, args: string[], ask: Ask): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    // git is started directly with its argument list, not through a shell, so nothing in `args` is ever parsed as a command line.
    const p = pty.spawn(IS_WIN ? 'git.exe' : 'git', args, {
      name: 'xterm-256color', cols: 200, rows: 40, cwd,
      env: { ...cleanEnv(), GIT_TERMINAL_PROMPT: '0' },
      ...CONPTY,
    })
    let out = '', asked = 0, asking = false, done = false, why = ''
    const finish = (r: { ok: boolean; error?: string }) => {
      if (done) return
      done = true
      clearTimeout(quiet)
      resolve(r)
    }
    const stop = (reason: string) => {
      why = reason
      kill(p)
    }
    let quiet = setTimeout(() => stop('Timed out waiting for the remote.'), QUIET_MS)
    p.onData((d) => {
      out = (out + d).slice(-4000)
      if (!asking) {
        clearTimeout(quiet)
        quiet = setTimeout(() => stop('Timed out waiting for the remote.'), QUIET_MS)
      }
      const q = asking ? null : promptOf(out)
      if (!q) return
      if (q.kind === 'hostkey') return stop('The remote is not trusted yet. Run git push once in a terminal to accept its host key, then try again.')
      if (asked >= MAX_ASKS) return stop('The passphrase was not accepted.')
      asked++
      asking = true
      clearTimeout(quiet)
      // What ssh printed so far is dealt with; the next prompt is read from what comes after.
      out = ''
      ask(q).then((secret) => {
        asking = false
        if (done) return
        if (secret == null) return stop('Push cancelled.')
        quiet = setTimeout(() => stop('Timed out waiting for the remote.'), QUIET_MS)
        p.write(secret + '\r')
      }).catch(() => stop('Push cancelled.'))
    })
    p.onExit(({ exitCode }) => {
      if (why) return finish({ ok: false, error: why })
      finish(exitCode === 0 ? { ok: true } : { ok: false, error: failureText(out) || `git push exited with code ${exitCode}.` })
    })
  })
}
