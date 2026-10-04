import { defineStore } from 'pinia'
import type { HookEvent, Project, Repo, SavedSession, Session, ShellKind, UsageUpdate } from '#shared/types'
import { costOf, modelLabel } from '#shared/pricing'

function relPath(cwd: string, file: string) {
  const f = file.replace(/\\/g, '/'), c = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  return f.toLowerCase().startsWith(c.toLowerCase() + '/') ? f.slice(c.length + 1) : f
}

/** "Permission: edit schema.ts" plus the longer "Edit file src/.../schema.ts" for notifications. */
function describeTool(s: Session, tool: { name: string; input: any } | undefined) {
  if (!tool) return { what: 'Permission needed', action: 'Permission needed' }
  const file = tool.input?.file_path || tool.input?.notebook_path
  if (file) {
    const rel = relPath(s.cwd, String(file)), base = rel.split('/').pop()
    const create = tool.name === 'Write'
    return { what: `Permission: ${create ? 'create' : 'edit'} ${base}`, action: `${create ? 'Create' : 'Edit'} file ${rel}` }
  }
  if (tool.name === 'Bash') {
    const cmd = String(tool.input?.command || '').split('\n')[0]!.slice(0, 60)
    return { what: `Permission: run ${cmd.slice(0, 30)}`, action: `Run ${cmd}` }
  }
  return { what: `Permission: ${tool.name}`, action: tool.name }
}

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([])
  /** Focused session per project. */
  const focus = ref<Record<string, string | null>>({})
  /** Last tool Claude asked about, per session; explains permission prompts. */
  const lastTool = new Map<string, { name: string; input: any }>()
  /** Longer permission text for notifications, per session. */
  const permAction = ref<Record<string, string>>({})

  const byId = (id: string | null | undefined) => sessions.value.find(s => s.id === id) || null
  /** Panes of a project: Claude sessions and pane shells (docked shells live in the dock panel). */
  const ofProject = (pid: string) => sessions.value.filter(s => s.pid === pid && !s.docked)
  /** Claude sessions only: what prompting, sharing, the inbox and costs work with. */
  const claudeOf = (pid: string) => sessions.value.filter(s => s.pid === pid && s.kind === 'claude')
  /** Shells in the dock panel. */
  const dockedOf = (pid: string) => sessions.value.filter(s => s.pid === pid && s.docked)
  /** Shells found on this machine, loaded once. */
  const shells = ref<{ kind: ShellKind; label: string; exe: string }[]>([])
  // Optional: a main process from before shells existed has no such call until the app restarts.
  api.sys.shells?.().then((l) => {
    shells.value = l || []
    // Shells reopened before the list arrived got a placeholder title.
    sessions.value = sessions.value.map(x => (x.kind === 'shell' && x.title === 'Shell' ? { ...x, title: shellLabel(x.shell) } : x))
  }).catch(() => {})
  const shellLabel = (k?: ShellKind) => shells.value.find(s => s.kind === k)?.label || 'Shell'

  function focusedId(pid: string | null): string | null {
    if (!pid) return null
    const ss = ofProject(pid)
    const f = ss.find(s => s.id === focus.value[pid]) || ss[0]
    return f ? f.id : null
  }

  function setFocus(pid: string, sid: string | null) {
    focus.value = { ...focus.value, [pid]: sid }
  }

  function update(id: string, fn: (s: Session) => Session) {
    sessions.value = sessions.value.map(s => (s.id === id ? fn(s) : s))
  }

  function patch(id: string, p: Partial<Session>) {
    update(id, s => ({ ...s, ...p }))
  }

  function cost(s: Session) {
    return costOf(s.model, s)
  }

  /** Starts Claude Code in a repo, optionally in a fresh git worktree, or reopens a saved session. */
  async function start(p: Project, r: Repo, o: { wt?: boolean; resume?: boolean; reopen?: SavedSession } = {}): Promise<Session | null> {
    const prefs = usePrefsStore().prefs
    const re = o.reopen
    const id = re?.id || uid('s')
    let cwd = re?.cwd || r.path, branch = re?.branch || r.branch || 'main', wt: Session['wt'] = re?.wt || null
    if (o.wt && !re) {
      const n = sessions.value.filter(x => x.repoId === r.id && x.wt).length + 1
      const slug = `session-${n}-${Math.random().toString(36).slice(2, 5)}`
      try {
        const res = await api.git.worktreeAdd(r.path, r.branch || 'HEAD', slug)
        cwd = res.path
        branch = res.branch
        wt = { path: res.path, base: r.branch || 'main' }
      } catch (e: any) {
        useUiStore().toast({ title: 'Could not create a worktree', body: String(e?.message || e), hue: p.hue, ini: p.ini, error: true })
        return null
      }
    }
    let cmd = (re?.cmd || r.cmd || prefs.startCmd || 'claude').trim()
    if (re) cmd = resumeCmd(cmd, re.resumable ? re.claudeId : '')
    else if (o.resume && !/--continue|\s-c\b|--resume|\s-r\b/.test(cmd) && /^claude\b/.test(cmd)) cmd += ' --continue'
    const now = Date.now()
    const s: Session = {
      id, kind: 'claude', pid: p.id, repoId: r.id, cwd, cmd, title: re?.title || 'New session', status: 'idle', branch, wt,
      model: '', ctx: 0, tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0, images: [],
      started: re?.started || now, lastAt: now, endedAt: null, waitingSince: null, waitWhat: '', perm: false,
      promptCount: re?.prompts.length || 0, prompts: re?.prompts || [], claudeId: re?.claudeId || '', changed: [], editing: '', exited: false,
    }
    sessions.value = [...sessions.value, s]
    ensureTerminal(id)
    const { cols, rows } = terminalSize(id)
    api.pty.spawn({ id, cwd, cmd, cols, rows }).catch((e) => {
      writeToTerminal(id, `\r\n\x1b[31mCould not start "${cmd}": ${String(e?.message || e)}\x1b[0m\r\n`)
    })
    useGitStore().refresh(cwd)
    return s
  }

  /** Opens a plain shell in a folder, as a pane or docked in the dock panel. */
  function startShell(p: Project, r: Repo, o: { id?: string; cwd?: string; kind?: ShellKind; docked?: boolean; branch?: string } = {}): Session {
    const kind = o.kind || usePrefsStore().prefs.shell || shells.value[0]?.kind || 'powershell'
    const id = o.id || uid('s'), now = Date.now(), cwd = o.cwd || r.path
    const s: Session = {
      id, kind: 'shell', shell: kind, docked: !!o.docked, pid: p.id, repoId: r.id, cwd, cmd: '', title: shellLabel(kind), status: 'idle',
      branch: o.branch || r.branch || '', wt: null, model: '', ctx: 0, tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0, images: [],
      started: now, lastAt: now, endedAt: null, waitingSince: null, waitWhat: '', perm: false,
      promptCount: 0, prompts: [], claudeId: '', changed: [], editing: '', exited: false,
    }
    sessions.value = [...sessions.value, s]
    ensureTerminal(id)
    const { cols, rows } = terminalSize(id)
    if (!api.pty.shell) {
      writeToTerminal(id, '\x1b[33mRestart Canopy to use shells (the app was updated while running).\x1b[0m\r\n')
      return s
    }
    api.pty.shell({ id, cwd, kind, cols, rows }).catch((e) => {
      writeToTerminal(id, `\r\n\x1b[31mCould not start ${shellLabel(kind)}: ${String(e?.message || e)}\x1b[0m\r\n`)
    })
    return s
  }

  /** Closes a session: kills its terminal and removes the pane. */
  function close(id: string) {
    const s = byId(id)
    if (!s) return
    const ss = ofProject(s.pid)
    const i = ss.findIndex(x => x.id === id)
    const rest = ss.filter(x => x.id !== id)
    const nf = rest[Math.min(i, rest.length - 1)]
    sessions.value = sessions.value.filter(x => x.id !== id)
    if (focus.value[s.pid] === id) setFocus(s.pid, nf ? nf.id : null)
    api.pty.kill(id)
    disposeTerminal(id)
    lastTool.delete(id)
  }

  /** Restarts a session's terminal in a new folder, keeping the pane (used after merging a worktree). */
  async function respawn(id: string, cwd: string, patchS: Partial<Session>) {
    const s = byId(id)
    if (!s) return
    await api.pty.kill(id)
    patch(id, { ...patchS, cwd, exited: false, status: 'idle' })
    writeToTerminal(id, '\x1b[2J\x1b[3J\x1b[H')
    const { cols, rows } = terminalSize(id)
    await api.pty.spawn({ id, cwd, cmd: s.cmd, cols, rows })
  }

  // ---------- Saved across restarts ----------

  /** What is saved so open sessions and shells can be reopened after a restart. */
  const saved = computed<SavedSession[]>(() => sessions.value.map(s => ({
    id: s.id, kind: s.kind, shell: s.shell, docked: s.docked, pid: s.pid, repoId: s.repoId, cwd: s.cwd, cmd: s.cmd,
    title: s.title, branch: s.branch, wt: s.wt, claudeId: s.claudeId, resumable: s.tokOut > 0 || s.prompts.length > 0, started: s.started, prompts: s.prompts.slice(-5),
  })))

  /** The startup command without its resume flags, then resuming this exact conversation when it has one. */
  function resumeCmd(cmd: string, claudeId: string) {
    const base = cmd.replace(/\s+(--continue|-c)\b/g, '').replace(/\s+(--resume|-r)(\s+[\w-]{8,})?/g, '').trim()
    return claudeId && /^claude\b/.test(base) ? `${base} --resume ${claudeId}` : base
  }

  /** Reopens saved sessions: Claude sessions resume their own conversation, shells start fresh in the same folder. */
  function reopen(list: SavedSession[]) {
    const P = useProjectsStore()
    for (const x of list) {
      const p = P.byId(x.pid), r = p?.repos.find(rr => rr.id === x.repoId)
      if (!p || !r || byId(x.id)) continue
      if (x.kind === 'shell') startShell(p, r, { id: x.id, cwd: x.cwd, kind: x.shell, docked: x.docked, branch: x.branch })
      else start(p, r, { reopen: x })
    }
  }

  function onUsage(u: UsageUpdate) {
    const s = byId(u.sid)
    if (!s) return
    const title = s.title === 'New session' && u.lastPrompt ? u.lastPrompt.slice(0, 200) : s.title
    patch(u.sid, { model: u.model ? modelLabel(u.model) : s.model, tokIn: u.tokIn, tokOut: u.tokOut, cacheR: u.cacheR, cacheW: u.cacheW, ctx: u.ctx, claudeId: u.claudeId || s.claudeId, title })
  }

  function onExit(id: string, code: number) {
    const s = byId(id)
    if (!s) return
    if (s.kind === 'shell') {
      writeToTerminal(id, `\r\n\x1b[2m[${shellLabel(s.shell)} exited · code ${code}]\x1b[0m\r\n`)
      patch(id, { exited: true, endedAt: Date.now() })
      return
    }
    writeToTerminal(id, `\r\n\x1b[2m[Claude Code exited · code ${code}]\x1b[0m\r\n`)
    patch(id, { exited: true, status: s.status === 'working' || s.status === 'waiting' ? 'done' : s.status, endedAt: s.endedAt || Date.now() })
  }

  /** Session status comes from Claude Code hooks. */
  function onHook(e: HookEvent) {
    const s = byId(e.sid)
    if (!s) return
    const now = Date.now(), p = e.payload
    const prev = s.status
    switch (e.event) {
      case 'SessionStart':
        patch(s.id, { claudeId: String(p.session_id || s.claudeId) })
        break
      case 'UserPromptSubmit': {
        const text = String(p.prompt || '').trim()
        const pc = s.promptCount + 1
        patch(s.id, {
          status: 'working', title: text.split('\n')[0]!.slice(0, 200) || s.title, prompts: [...s.prompts, { t: text, at: now }],
          promptCount: pc, waitingSince: null, waitWhat: '', perm: false, lastAt: now, endedAt: null,
          images: s.images.map(im => (im.pending ? { ...im, pending: false, prompt: pc } : im)),
        })
        break
      }
      case 'PreToolUse': {
        lastTool.set(s.id, { name: String(p.tool_name || ''), input: p.tool_input || {} })
        const f = p.tool_input?.file_path || p.tool_input?.notebook_path
        patch(s.id, { editing: f ? relPath(s.cwd, String(f)) : '', ...(s.status === 'waiting' ? { status: 'working', waitingSince: null, perm: false } : {}), lastAt: now })
        break
      }
      case 'PostToolUse': {
        const f = p.tool_input?.file_path || p.tool_input?.notebook_path
        const rel = f ? relPath(s.cwd, String(f)) : ''
        patch(s.id, {
          editing: '', changed: rel && !s.changed.includes(rel) ? [...s.changed, rel] : s.changed, lastAt: now,
          ...(s.status === 'waiting' ? { status: 'working', waitingSince: null, perm: false } : {}),
        })
        useGitStore().refresh(s.cwd)
        break
      }
      case 'Notification': {
        const msg = String(p.message || '')
        if (/permission/i.test(msg)) {
          const d = describeTool(s, lastTool.get(s.id))
          permAction.value = { ...permAction.value, [s.id]: d.action }
          patch(s.id, { status: 'waiting', perm: true, waitingSince: now, waitWhat: d.what, lastAt: now })
        } else if (s.status === 'working') {
          patch(s.id, { status: 'waiting', perm: false, waitingSince: now, waitWhat: 'Waiting for input', lastAt: now })
        }
        break
      }
      case 'Stop': {
        const last = (e.lastText || '').trim()
        if (/\?\s*$/.test(last)) {
          const q = last.split(/(?<=[.!?])\s+/).filter(x => /\?$/.test(x)).pop() || last
          patch(s.id, { status: 'waiting', perm: false, waitingSince: now, waitWhat: 'Question: ' + q.slice(0, 80), lastAt: now })
        } else {
          patch(s.id, { status: 'done', perm: false, waitingSince: null, waitWhat: '', endedAt: now, lastAt: now })
        }
        useGitStore().refresh(s.cwd)
        break
      }
    }
    const after = byId(s.id)
    if (after && after.status !== prev && (after.status === 'waiting' || after.status === 'done')) useUiStore().notifySession(after)
  }

  // ---------- Images ----------

  async function addImage(sid: string, file: File) {
    const s = byId(sid)
    if (!s) return
    const t = new Date()
    const name = `pasted-${clock(t.getTime()).replace(':', '')}${String(t.getSeconds()).padStart(2, '0')}.png`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const path = await api.sys.saveImage(sid, name, bytes)
    const n = s.images.length + 1
    const src = URL.createObjectURL(file)
    patch(sid, { images: [...s.images, { n, name, path, src, pending: true }] })
    useUiStore().stripOn = true
    useUiStore().stripMode = 'prompt'
    // Claude Code attaches an image when its file path is pasted at the prompt.
    pasteInto(sid, `"${path}" `)
    focusTerminal(sid)
  }

  function removeImage(sid: string, n: number) {
    const s = byId(sid)
    const im = s?.images.find(x => x.n === n)
    if (!s || !im || !im.pending) return
    patch(sid, { images: s.images.filter(x => x.n !== n).map(x => (x.n > n ? { ...x, n: x.n - 1 } : x)) })
  }

  return {
    sessions, focus, permAction, shells, byId, ofProject, claudeOf, dockedOf, shellLabel, focusedId, setFocus, update, patch, cost,
    start, startShell, close, respawn, onUsage, onExit, onHook, addImage, removeImage, saved, reopen,
  }
})
