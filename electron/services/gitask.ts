// Questions a push puts to the user (a key's passphrase): sent to the window that pushed, answered by git:answer.
import crypto from 'node:crypto'
import type { GitPrompt } from '../../shared/gitprompt'

const waiting = new Map<string, (secret: string | null) => void>()

/** Asks the window; resolves with what was typed, or null when it was cancelled or the window went away. */
export function askUser(sender: Electron.WebContents, cwd: string, p: Exclude<GitPrompt, { kind: 'hostkey' }>): Promise<string | null> {
  return new Promise((resolve) => {
    if (sender.isDestroyed()) return resolve(null)
    const id = crypto.randomUUID()
    const settle = (s: string | null) => {
      if (!waiting.delete(id)) return
      sender.removeListener('destroyed', gone)
      resolve(s)
    }
    const gone = () => settle(null)
    waiting.set(id, settle)
    sender.once('destroyed', gone)
    sender.send('git:ask', { id, cwd, kind: p.kind, label: p.label })
  })
}

export function answerAsk(id: string, secret: string | null) {
  waiting.get(id)?.(typeof secret === 'string' ? secret : null)
}
