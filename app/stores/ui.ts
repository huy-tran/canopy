import { defineStore } from 'pinia'
import type { DockPanelState, Layout, PlanUsage, RecapHours, Session, UpdateState, ShellKind } from '#shared/types'

export type PaletteMode = 'nav' | 'cmd'
export type SettingsTab = 'general' | 'appearance' | 'terminal' | 'notifications' | 'keys'

export const useUiStore = defineStore('ui', () => {
  const P = useProjectsStore()
  const S = useSessionsStore()
  const V = useServicesStore()
  const G = useGitStore()
  const prefsStore = usePrefsStore()
  const nuxtToast = useToast()

  const width = ref(typeof window !== 'undefined' ? window.innerWidth : 1440)
  const now = ref(Date.now())
  const palette = ref<PaletteMode | null>(null)
  const projectModal = ref<{ mode: 'add' | 'edit'; pid: string | null; confirmDel: boolean } | null>(null)
  const explorer = ref<{ tab: 'changes' | 'files'; repoId: string; cwd: string; wt: boolean } | null>(null)
  const settings = ref<SettingsTab | null>(null)
  const about = ref(false)
  /** Daily summary modal for a project. */
  const summary = ref<{ pid: string } | null>(null)
  /** Recaps per project and day, saved with the app state. */
  const recaps = ref<Record<string, string>>({})
  /** Timesheet hours for those recaps: Claude's estimate and any value typed in. */
  const recapHours = ref<Record<string, RecapHours>>({})
  const updOpen = ref(false)
  const upd = ref<UpdateState | null>(null)
  const details = ref(false)
  const inbox = ref<{ sid: string | null; leftAt?: number } | null>(null)
  const bc = ref<{ text: string; targets: string[] } | null>(null)
  const svcAdd = ref(false)
  const logsOpen = ref(false)
  const svcTab = ref<string | null>(null)
  /** Dock panel state per project, saved with the app state and swapped in as the selected project changes. */
  const panels = ref<Record<string, DockPanelState>>({})
  // Sync so code that selects a project and then opens a tab is not overwritten afterwards.
  watch(() => P.sel, (next) => {
    const saved = next ? panels.value[next] : undefined
    logsOpen.value = saved?.open ?? false
    svcTab.value = saved?.tab ?? null
  }, { flush: 'sync' })
  watch([logsOpen, svcTab], ([open, tab]) => {
    if (P.sel) panels.value = { ...panels.value, [P.sel]: { open, tab } }
  }, { flush: 'sync' })
  const stripOn = ref(true)
  const stripMode = ref<'prompt' | 'session'>('prompt')
  const lightbox = ref<{ sid: string; idx: number } | null>(null)
  const hoverImg = ref<{ sid: string; n: number; x: number; y: number } | null>(null)
  const newMenu = ref(false)
  const range = ref(30)
  const repoFilter = ref('all')
  const usage = ref<PlanUsage | null>(null)
  /** Projects whose first start after launch should resume with --continue. */
  const resumeOnce = new Set<string>()

  const wide = computed(() => width.value >= 900)
  const cur = computed(() => P.current)
  const fid = computed(() => S.focusedId(P.sel))
  const focused = computed(() => S.byId(fid.value))
  /** The dock panel is open and has a server or shell to show. */
  const panelShown = computed(() => {
    const p = cur.value
    return !!p && p.view !== 'overview' && logsOpen.value && (V.ofProject(p).length > 0 || S.dockedOf(p.id).length > 0)
  })
  const waitList = computed(() => S.sessions.filter(s => s.status === 'waiting').sort((a, b) => (a.waitingSince || 0) - (b.waitingSince || 0)))

  function toast(o: { title: string; body?: string; hue?: number; error?: boolean }) {
    nuxtToast.add({ title: o.title, description: o.body, color: o.error ? 'error' : 'neutral', duration: o.error ? 6000 : 3500 })
  }

  function focusLater() {
    setTimeout(() => {
      const id = fid.value
      if (id && !palette.value && !projectModal.value && !settings.value && !explorer.value) focusTerminal(id)
    }, 30)
  }

  // ---------- Navigation ----------

  function closeTransient() {
    newMenu.value = false
    svcAdd.value = false
  }

  function selectProject(pid: string) {
    P.sel = pid
    inbox.value = null
    bc.value = null
    closeTransient()
    const p = P.byId(pid)
    if (p?.autoStart && !S.claudeOf(pid).length && p.repos.length) startAll(pid)
    focusLater()
  }

  function focusSession(sid: string) {
    const s = S.byId(sid)
    if (!s) return
    if (bc.value && s.pid !== P.sel) bc.value = null
    P.sel = s.pid
    palette.value = null
    newMenu.value = false
    if (inbox.value && inbox.value.sid !== sid) inbox.value = null
    S.setFocus(s.pid, sid)
    P.patch(s.pid, { view: 'terminals', expanded: true })
    focusLater()
  }

  function nextWaiting() {
    if (inbox.value) return inboxSkip()
    const w = waitList.value
    if (!w.length) return
    focusSession((w.find(s => s.id !== fid.value) || w[0]!).id)
  }

  function cycle(dir: number) {
    const ss = S.ofProject(P.sel || '')
    if (!ss.length) return
    const i = ss.findIndex(s => s.id === fid.value)
    focusSession(ss[(i + dir + ss.length) % ss.length]!.id)
  }

  /**
   * Steps through every open session in sidebar order (starred projects first), skipping projects without sessions
   * and wrapping at either end. Falls back to stepping through projects while no session is open anywhere.
   */
  function cycleProject(dir: number) {
    const ps = P.ordered
    if (!ps.length) return
    const ss = ps.flatMap(p => S.ofProject(p.id))
    if (!ss.length) {
      const i = ps.findIndex(p => p.id === P.sel)
      selectProject(ps[(i + dir + ps.length) % ps.length]!.id)
      return
    }
    let i = ss.findIndex(s => s.id === fid.value)
    if (i < 0) {
      // The selected project has no sessions: start from the gap where it sits in the sidebar.
      const at = ps.findIndex(p => p.id === P.sel)
      const after = ss.findIndex(s => ps.findIndex(p => p.id === s.pid) > at)
      i = (after < 0 ? ss.length : after) - (dir > 0 ? 1 : 0)
    }
    focusSession(ss[(i + dir + ss.length) % ss.length]!.id)
  }

  function setLayout(l: Layout) {
    if (!P.sel) return
    P.patch(P.sel, { layout: l, view: 'terminals' })
    focusLater()
  }

  function cycleLayout() {
    const p = cur.value
    if (!p) return
    const L: Layout[] = ['tabs', 'split', 'grid']
    setLayout(L[(L.indexOf(p.layout) + 1) % 3]!)
  }

  function setView(v: 'terminals' | 'overview') {
    if (!P.sel) return
    P.patch(P.sel, { view: v })
    if (v === 'terminals') focusLater()
  }

  function toggleView() {
    const p = cur.value
    if (p) setView(p.view === 'overview' ? 'terminals' : 'overview')
  }

  // ---------- Sessions ----------

  async function newSession(repoId?: string | null, wt?: boolean) {
    const p = cur.value
    if (!p || !p.repos.length) return
    newMenu.value = false
    const rid = repoId || focused.value?.repoId || p.repos[0]!.id
    const r = p.repos.find(x => x.id === rid) || p.repos[0]!
    const useWt = wt != null ? wt : S.sessions.some(x => x.repoId === r.id && !x.wt)
    const s = await S.start(p, r, { wt: useWt })
    if (!s) return
    S.setFocus(p.id, s.id)
    P.patch(p.id, { view: 'terminals', expanded: true })
    focusLater()
  }

  async function startAll(pid: string) {
    const p = P.byId(pid)
    if (!p) return
    if (p.autoServices) V.startProject(p)
    P.sel = pid
    const have = new Set(S.claudeOf(pid).map(s => s.repoId))
    const resume = resumeOnce.has(pid)
    resumeOnce.delete(pid)
    const added: Session[] = []
    for (const r of p.repos.filter(r => !have.has(r.id))) {
      const s = await S.start(p, r, { resume })
      if (s) added.push(s)
    }
    if (added.length) {
      S.setFocus(pid, added[0]!.id)
      P.patch(pid, { view: 'terminals', expanded: true })
    }
    focusLater()
  }

  function closeSession(sid: string) {
    S.close(sid)
    focusLater()
  }

  async function openEditor() {
    const s = focused.value, p = cur.value
    if (!s || !p) return
    const r = P.repoOf(p.id, s.repoId)
    const res = await api.sys.openEditor(p.editor, s.cwd)
    if (res.ok) toast({ title: `Opening ${r.label} in ${p.editor}`, body: s.cwd, hue: p.hue })
    else toast({ title: `Could not open ${p.editor}`, body: res.error, error: true })
  }

  async function mergeWt(sid: string) {
    const s = S.byId(sid)
    if (!s?.wt) return
    const p = P.byId(s.pid)!, r = P.repoOf(s.pid, s.repoId)
    const from = s.branch, base = s.wt.base, wtPath = s.wt.path
    await api.pty.kill(sid)
    const res = await api.git.merge(r.path, wtPath, from, base)
    if (!res.ok) {
      toast({ title: `Could not merge ${from}`, body: res.error, error: true })
      await S.respawn(sid, wtPath, {})
      return
    }
    await S.respawn(sid, r.path, { wt: null, branch: base })
    G.refresh(r.path)
    toast({ title: `Merged ${from} into ${base}`, body: 'Worktree removed. The session now runs in the main folder.', hue: p.hue })
  }

  // ---------- Inbox ----------

  function inboxGo(sid: string) {
    const s = S.byId(sid)
    if (!s) return
    inbox.value = { sid }
    P.sel = s.pid
    palette.value = null
    bc.value = null
    newMenu.value = false
    S.setFocus(s.pid, sid)
    P.patch(s.pid, { view: 'terminals', expanded: true })
    focusLater()
  }

  function toggleInbox() {
    if (inbox.value) {
      inbox.value = null
      return
    }
    const w = waitList.value
    if (w.length) inboxGo(w[0]!.id)
    else inbox.value = { sid: null }
  }

  function inboxSkip() {
    const w = waitList.value
    if (!w.length) return
    const i = w.findIndex(s => s.id === inbox.value?.sid)
    inboxGo(w[(i + 1) % w.length]!.id)
  }

  /** Called every second: once the shown session is answered, move to the next oldest after ~1.2s. */
  function inboxTick() {
    const ib = inbox.value
    if (!ib) return
    const curS = ib.sid ? S.byId(ib.sid) : null
    if (curS && curS.status === 'waiting') return
    if (curS && !ib.leftAt) {
      inbox.value = { ...ib, leftAt: Date.now() }
      return
    }
    if (!curS || Date.now() - (ib.leftAt || 0) > 1200) {
      const w = waitList.value.filter(s => s.id !== ib.sid)
      if (w.length) inboxGo(w[0]!.id)
      else if (ib.sid) inbox.value = { sid: null }
    }
  }

  // ---------- Prompt all / share ----------

  function openBc() {
    const ss = S.claudeOf(P.sel || '')
    if (ss.length < 2) return
    const by: Record<string, string> = {}
    ss.forEach((s) => {
      if (!by[s.repoId] || s.id === fid.value) by[s.repoId] = s.id
    })
    bc.value = { text: '', targets: Object.values(by) }
    palette.value = null
    newMenu.value = false
  }

  function sendBc() {
    const b = bc.value
    if (!b) return
    const text = b.text.trim()
    const ids = b.targets.filter(id => S.sessions.some(s => s.id === id && s.pid === P.sel))
    if (!text || !ids.length) return
    // Typed into each Claude prompt, then submitted with Enter.
    ids.forEach((id) => {
      pasteInto(id, text)
      setTimeout(() => api.pty.write(id, '\r'), 60)
    })
    bc.value = null
    focusLater()
  }

  /** Sessions in this project's other repos, and the files this session changed that git still shows. */
  function shareInfo(sid: string) {
    const s = S.byId(sid)
    if (!s) return { others: [] as Session[], mine: [] as { p: string; a: number; d: number }[] }
    const others = S.claudeOf(s.pid).filter(x => x.repoId !== s.repoId)
    const st = G.get(s.cwd)
    const mine = (st?.changes || []).filter(c => s.changed.includes(c.p))
    return { others, mine }
  }

  function shareChanges(sid: string) {
    const s = S.byId(sid)
    if (!s) return
    const p = P.byId(s.pid)!, r = P.repoOf(s.pid, s.repoId)
    const { others, mine } = shareInfo(sid)
    if (!others.length) {
      const other = p.repos.find(x => x.id !== s.repoId)
      toast({ title: 'No session in another repo', body: 'Start one in ' + (other ? other.label : 'the other repo') + ' first.', hue: p.hue })
      return
    }
    const t = others.find(x => x.status !== 'working') || others[0]!
    const tr = P.repoOf(t.pid, t.repoId)
    const files = mine.length ? mine.map(c => `${c.p} (+${c.a} −${c.d})`).join(', ') : 'no files yet'
    const text = `Context from the ${r.label} session ("${s.title}"): it changed ${files}. Update the ${tr.label} to match.`
    focusSession(t.id)
    setTimeout(() => {
      pasteInto(t.id, text)
      focusTerminal(t.id)
    }, 60)
  }

  function shareFocused() {
    if (fid.value) shareChanges(fid.value)
  }

  /** Inserts @path at the prompt of a session in that repo (the focused one when it matches). */
  function mention(repoId: string, path: string) {
    const p = cur.value
    if (!p) return
    const r = p.repos.find(x => x.id === repoId)
    const ss = S.claudeOf(p.id).filter(s => s.repoId === repoId)
    const target = ss.find(s => s.id === fid.value) || ss[0]
    if (!target) {
      toast({ title: 'No session running in ' + (r?.label || 'this repo'), body: 'Start one to mention files in a prompt.', hue: p.hue })
      return
    }
    explorer.value = null
    focusSession(target.id)
    setTimeout(() => {
      pasteInto(target.id, '@' + path + ' ')
      focusTerminal(target.id)
    }, 60)
  }

  // ---------- Overlays ----------

  function openPalette(mode: PaletteMode) {
    palette.value = mode
    closeTransient()
  }

  function openModal(mode: 'add' | 'edit', pid?: string | null, confirmDel = false) {
    if (mode === 'edit' && !P.byId(pid || P.sel)) return
    projectModal.value = { mode, pid: mode === 'edit' ? (pid || P.sel) : null, confirmDel }
    palette.value = null
    closeTransient()
  }

  function openSummary(pid?: string | null) {
    const id = pid || P.sel
    if (!id || !P.byId(id)) return
    summary.value = { pid: id }
    palette.value = null
    closeTransient()
  }

  function openSettings(tab: SettingsTab = 'general') {
    settings.value = tab
    palette.value = null
    about.value = false
  }

  function openExplorer(tab?: 'changes' | 'files', repoId?: string) {
    const p = cur.value
    if (!p || !p.repos.length) return
    const fs = focused.value
    const r = p.repos.find(x => x.id === (repoId || fs?.repoId)) || p.repos[0]!
    const inWt = !!(fs && fs.repoId === r.id && fs.wt)
    const cwd = inWt ? fs!.cwd : r.path
    const changes = G.get(cwd)?.changes.length || 0
    explorer.value = { tab: tab || (changes ? 'changes' : 'files'), repoId: r.id, cwd, wt: inWt }
    palette.value = null
    details.value = false
    closeTransient()
  }

  /** Dev server logs live in the dock panel; opening them selects a server tab. */
  function toggleLogs(id?: string) {
    if (id) {
      logsOpen.value = !(logsOpen.value && svcTab.value === id)
      svcTab.value = id
      return
    }
    const svcIds = V.ofProject(cur.value).map(v => v.id)
    if (logsOpen.value && (!svcTab.value || svcIds.includes(svcTab.value))) {
      logsOpen.value = false
      return
    }
    if (!svcTab.value || !svcIds.includes(svcTab.value)) svcTab.value = svcIds[0] || null
    logsOpen.value = true
  }

  // ---------- Shells ----------

  /** Folder for a new shell: the focused session's folder (its worktree when it has one), else the repo. */
  function shellTarget(repoId?: string | null) {
    const p = cur.value
    if (!p || !p.repos.length) return null
    const fs = focused.value
    const r = p.repos.find(x => x.id === (repoId || fs?.repoId)) || p.repos[0]!
    const cwd = fs && fs.repoId === r.id ? fs.cwd : r.path
    const branch = fs && fs.repoId === r.id ? fs.branch : r.branch
    return { p, r, cwd, branch }
  }

  /** Opens a plain shell, docked in the dock panel by default or as a pane. */
  function openShell(repoId?: string | null, o: { kind?: ShellKind; docked?: boolean; cwd?: string } = {}) {
    const t = shellTarget(repoId)
    if (!t) return
    newMenu.value = false
    palette.value = null
    const docked = o.docked ?? true
    const s = S.startShell(t.p, t.r, { kind: o.kind, docked, cwd: o.cwd || t.cwd, branch: t.branch })
    if (docked) {
      svcTab.value = s.id
      logsOpen.value = true
    } else {
      S.setFocus(t.p.id, s.id)
      P.patch(t.p.id, { view: 'terminals' })
    }
    setTimeout(() => focusTerminal(s.id), 60)
  }

  /** Open while the dock panel's "new shell" menu is showing, so a shortcut can pop it. */
  const shellPicker = ref(false)

  /** The docked shell showing in the panel, if a shell tab is selected. */
  function panelShell() {
    const s = S.byId(svcTab.value)
    return s?.docked && s.pid === P.sel ? s : null
  }

  /** A new docked shell next to the one in view: same repo and folder. */
  function newPanelShell(kind?: ShellKind) {
    const s = panelShell()
    openShell(s?.repoId, { kind, cwd: s?.cwd })
  }

  function cycleShell(dir: number) {
    const ss = S.dockedOf(P.sel || '')
    if (!ss.length) return
    const i = ss.findIndex(s => s.id === svcTab.value)
    const next = ss[(i + dir + ss.length) % ss.length]!
    svcTab.value = next.id
    setTimeout(() => focusTerminal(next.id), 60)
  }

  /** Ctrl+`: shows the shell panel, starting a shell when there is none. Closes it when a shell is showing. */
  function toggleShellPanel() {
    const p = cur.value
    if (!p) return
    const docked = S.dockedOf(p.id)
    const onShell = docked.some(d => d.id === svcTab.value)
    if (logsOpen.value && onShell) {
      logsOpen.value = false
      focusLater()
      return
    }
    if (!docked.length) return openShell()
    const target = docked.find(d => d.id === svcTab.value) || docked[docked.length - 1]!
    svcTab.value = target.id
    logsOpen.value = true
    P.patch(p.id, { view: 'terminals' })
    setTimeout(() => focusTerminal(target.id), 60)
  }

  // ---------- Images ----------

  function openLightbox(sid: string, n: number) {
    const s = S.byId(sid)
    const idx = s ? s.images.findIndex(im => im.n === n) : -1
    if (idx < 0) return
    lightbox.value = { sid, idx }
    hoverImg.value = null
  }

  // ---------- Updates & app ----------

  function checkUpdates() {
    updOpen.value = true
    about.value = false
    api.upd.check()
  }

  function quitApp() {
    api.app.quit()
  }

  // ---------- Notifications ----------

  function isViewing(s: Session) {
    const p = P.byId(s.pid)
    return typeof document !== 'undefined' && document.hasFocus() && P.sel === s.pid && !!p && p.view === 'terminals' && (p.layout !== 'tabs' || fid.value === s.id)
  }

  function notifySession(s: Session) {
    const pr = prefsStore.prefs
    if (pr.dnd) return
    if (s.status === 'done' && !pr.notifyDone) return
    if (s.status === 'waiting' && !pr.notifyWaiting) return
    if (pr.skipViewing && isViewing(s)) return
    const p = P.byId(s.pid), r = P.repoOf(s.pid, s.repoId)
    if (!p) return
    const w = s.status === 'waiting'
    const title = `${p.name} · ${r.label} ${w ? (s.perm ? 'needs permission' : 'needs input') : 'finished'}`
    const body = w ? (s.perm ? (S.permAction[s.id] || s.waitWhat) : s.waitWhat) : `${s.title} · ${dur(Date.now() - s.started)} · ${usd(S.cost(s))}`
    if (!w) {
      api.sys.notify({ title, body, sid: s.id, silent: !pr.sound })
      return
    }
    // Give Claude a moment to draw its choices, then offer them as notification buttons.
    setTimeout(() => {
      const actions = promptOptions(s.id).map(o => ({ label: o.label, key: o.key }))
      api.sys.notify({ title, body, sid: s.id, silent: !pr.sound, actions })
    }, 400)
  }

  /** Answers the choice Claude is waiting on (permission or question) by its number, without opening the pane. */
  function answer(sid: string, key: string) {
    const s = S.byId(sid)
    if (!s || s.status !== 'waiting' || s.exited) return
    const chosen = promptOptions(sid).find(o => o.key === key)
    api.pty.write(sid, key)
    const p = P.byId(s.pid)
    if (chosen && p) toast({ title: `${p.name} · ${P.repoOf(s.pid, s.repoId).label}`, body: `Answered: ${chosen.text}` })
  }

  // ---------- Actions (keyboard and palette) ----------

  function runAction(id: string) {
    const A: Record<string, () => void> = {
      jump: () => openPalette('nav'),
      commands: () => openPalette('cmd'),
      nextWaiting,
      inbox: toggleInbox,
      nextProject: () => cycleProject(1),
      prevProject: () => cycleProject(-1),
      nextSession: () => cycle(1),
      prevSession: () => cycle(-1),
      paneRight: () => cycle(1),
      paneLeft: () => cycle(-1),
      toggleView,
      newSession: () => newSession(),
      promptAll: openBc,
      share: shareFocused,
      details: () => { details.value = !details.value },
      cycleLayout,
      strip: () => { stripOn.value = !stripOn.value },
      files: () => openExplorer(),
      editor: openEditor,
      logs: () => toggleLogs(),
      shell: toggleShellPanel,
      shellNew: () => newPanelShell(),
      shellNewPick: () => { shellPicker.value = true },
      shellNext: () => cycleShell(1),
      shellPrev: () => cycleShell(-1),
      newProject: () => openModal('add'),
      settings: () => openSettings('general'),
      shortcuts: () => openSettings('keys'),
      theme: () => prefsStore.toggleTheme(),
      checkUpdates,
      quit: quitApp,
    }
    A[id]?.()
  }

  return {
    width, now, palette, projectModal, explorer, settings, about, summary, recaps, recapHours, updOpen, upd, details, inbox, bc, svcAdd,
    logsOpen, svcTab, panels, shellPicker, stripOn, stripMode, lightbox, hoverImg, newMenu, range, repoFilter, usage, resumeOnce,
    wide, cur, fid, focused, panelShown, waitList,
    toast, focusLater, selectProject, focusSession, nextWaiting, cycle, setLayout, cycleLayout, setView, toggleView,
    newSession, startAll, closeSession, openEditor, mergeWt, inboxGo, toggleInbox, inboxSkip, inboxTick,
    openBc, sendBc, shareInfo, shareChanges, shareFocused, mention, openPalette, openModal, openSettings, openSummary, openExplorer,
    toggleLogs, openShell, newPanelShell, toggleShellPanel, openLightbox, checkUpdates, quitApp, isViewing, notifySession, answer, runAction,
  }
})
