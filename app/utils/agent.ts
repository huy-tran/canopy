// Carries out the worker tools a Claude session calls (see shared/agenttools.ts): the main window owns the sessions.
import { WAIT_MAX, type AgentCall, type AgentReply } from '#shared/agenttools'
import type { Session } from '#shared/types'

/** Workers one session may have running at a time. */
const MAX_WORKERS = 6

const ok = (v: unknown): AgentReply => ({ ok: true, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) })
const fail = (text: string): AgentReply => ({ ok: false, text })

/** A worker's turn is over: it finished, asks something, or its session ended. A worker not yet given its prompt is still starting. */
const settled = (s: Session | null) => !s || s.exited || s.status === 'done' || s.status === 'waiting'

function waitUntilSettled(id: string, ms: number): Promise<void> {
  const S = useSessionsStore()
  return new Promise((resolve) => {
    if (ms <= 0 || settled(S.byId(id))) return resolve()
    const finish = () => {
      stop()
      clearTimeout(timer)
      resolve()
    }
    const stop = watch(() => S.sessions, () => { if (settled(S.byId(id))) finish() })
    const timer = setTimeout(finish, ms)
  })
}

export async function runAgentTool(c: AgentCall): Promise<AgentReply> {
  const S = useSessionsStore(), P = useProjectsStore()
  const me = S.byId(c.sid)
  const p = me ? P.byId(me.pid) : null
  if (!me || me.kind !== 'claude' || !p) return fail('This session is not open in Canopy.')
  const a = c.args || {}
  const repoOf = (s: Session) => P.repoOf(s.pid, s.repoId).label
  /** A worker this session started, or null. */
  const mine = (id: unknown) => {
    const w = S.byId(String(id || ''))
    return w && w.parent === me.id ? w : null
  }
  const notMine = (id: unknown) => fail(`No worker "${String(id || '')}" started by this session. list_sessions shows your workers.`)
  const describe = (w: Session) => ({
    id: w.id,
    name: w.title,
    repo: repoOf(w),
    status: w.exited ? 'ended' : w.status === 'idle' ? 'starting' : w.status,
    waiting_for: w.status === 'waiting' ? w.waitWhat : undefined,
    branch: w.branch,
    folder: w.cwd,
    worktree: !!w.wt,
    changed_files: w.changed,
    last_message: S.results[w.id] || '',
  })

  switch (c.tool) {
    case 'list_sessions':
      return ok({
        project: p.name,
        repos: p.repos.map(r => ({ label: r.label, folder: r.path, branch: r.branch })),
        sessions: S.claudeOf(p.id).map(s => ({
          id: s.id, repo: repoOf(s), status: s.exited ? 'ended' : s.status, branch: s.branch, title: s.title,
          ...(s.id === me.id ? { you: true } : {}), ...(s.parent === me.id ? { your_worker: true } : {}),
        })),
      })

    case 'start_worker': {
      if (me.parent) return fail('A worker cannot start workers of its own. Finish your task and report it in your last message.')
      const prompt = String(a.prompt || '').trim()
      if (!prompt) return fail('Give the worker a prompt.')
      if (S.sessions.filter(s => s.parent === me.id && !s.exited).length >= MAX_WORKERS) return fail(`You already have ${MAX_WORKERS} workers open. Close one with close_worker first.`)
      const label = String(a.repo || '').trim().toLowerCase()
      const r = label ? p.repos.find(x => x.label.toLowerCase() === label) : p.repos.find(x => x.id === me.repoId)
      if (!r) return fail(`No repo "${String(a.repo || '')}" in this project. Its repos: ${p.repos.map(x => x.label).join(', ')}.`)
      const title = String(a.name || '').trim().slice(0, 80) || prompt.split('\n')[0]!.slice(0, 80)
      const w = await S.start(p, r, { wt: a.worktree !== false, prompt, parent: me.id, title })
      if (!w) return fail('The worker could not be started: creating its git worktree failed.')
      P.patch(p.id, { expanded: true })
      return ok({ ...describe(w), note: 'The worker is starting and will work on its own. Call worker_result with wait_seconds to wait for it.' })
    }

    case 'worker_result': {
      if (!mine(a.id)) return notMine(a.id)
      const wait = Math.min(WAIT_MAX, Math.max(0, Number(a.wait_seconds) || 0))
      await waitUntilSettled(String(a.id), wait * 1000)
      const w = mine(a.id)
      if (!w) return fail('The worker was closed.')
      return ok({ ...describe(w), ...(settled(w) ? {} : { note: 'Still working. Call worker_result again to keep waiting.' }) })
    }

    case 'message_worker': {
      const w = mine(a.id)
      if (!w) return notMine(a.id)
      const prompt = String(a.prompt || '').trim()
      if (!prompt) return fail('Give the worker a prompt.')
      if (!S.prompt(w.id, prompt)) return fail('The worker has ended and cannot take a prompt.')
      // Working from now, so a worker_result that follows waits for this turn and not the last one.
      S.patch(w.id, { status: 'working', waitingSince: null, waitWhat: '', perm: false })
      return ok('Sent.')
    }

    case 'close_worker': {
      const w = mine(a.id)
      if (!w) return notMine(a.id)
      S.close(w.id)
      return ok(`Closed. Its branch ${w.branch} and folder ${w.cwd} are still on disk.`)
    }
  }
  return fail(`Unknown tool: ${c.tool}`)
}
