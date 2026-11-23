// Tool calls from Claude sessions (the worker tools): passed to the main window, which owns the sessions, and answered from there.
import crypto from 'node:crypto'
import { WAIT_MAX, type AgentCall, type AgentReply } from '../../shared/agenttools'
import { send, state } from '../context'

const waiting = new Map<string, (r: AgentReply) => void>()
/** A call may wait on a worker for WAIT_MAX seconds; past that the window is not answering. */
const TIMEOUT_MS = (WAIT_MAX + 30) * 1000

export function callAgent(sid: string, tool: string, args: Record<string, unknown>): Promise<AgentReply> {
  return new Promise((resolve) => {
    if (!state.win || state.win.isDestroyed()) return resolve({ ok: false, text: 'The Canopy window is closed.' })
    const id = crypto.randomUUID()
    const timer = setTimeout(() => answerAgent(id, { ok: false, text: 'Canopy did not answer in time.' }), TIMEOUT_MS)
    waiting.set(id, (r) => {
      clearTimeout(timer)
      resolve(r)
    })
    const call: AgentCall = { id, sid, tool, args }
    send('agent:call', call)
  })
}

export function answerAgent(id: string, r: AgentReply) {
  const settle = waiting.get(id)
  if (!settle) return
  waiting.delete(id)
  settle({ ok: !!r?.ok, text: String(r?.text ?? '') })
}
