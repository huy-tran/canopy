// Boots the workspace: loads saved state, wires main-process events, and runs the timers.
import type { SharedState, ToolCmd, ToolState } from '#shared/bridge'
import type { Persisted } from '#shared/types'
import type { AwsTab } from '#shared/aws'
import type { GhTab } from '~/stores/github'
import type { SettingsTab } from '~/stores/ui'
import { comboOf, matchAction } from '#shared/actions'
import { NERD_SYMBOLS } from '#shared/fonts'
import { DEFAULT_PREFS } from '~/stores/prefs'

/** ANSI colours readable on a light terminal (xterm's defaults assume a dark one). */
const LIGHT_ANSI = {
  black: '#1D1E21', red: '#C0362C', green: '#2E7D32', yellow: '#9A6A00', blue: '#2155C4', magenta: '#8E3FA8', cyan: '#00798A', white: '#6B6E75',
  brightBlack: '#55585F', brightRed: '#D9443A', brightGreen: '#388E3C', brightYellow: '#B07A00', brightBlue: '#2F6BE0', brightMagenta: '#A24BBF', brightCyan: '#0A8FA3', brightWhite: '#3A3D42',
}

/** Recap entries for the days the daily summary can still show (today and the six before). */
function recent<T>(m: Record<string, T> | undefined): Record<string, T> {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - 6)
  return Object.fromEntries(Object.entries(m || {}).filter(([k]) => Number(k.slice(k.lastIndexOf(':') + 1)) >= d.getTime()))
}

export default defineNuxtPlugin({
  name: 'canopy',
  dependsOn: ['pinia'],
  async setup() {
    const P = useProjectsStore()
    const S = useSessionsStore()
    const V = useServicesStore()
    const G = useGitStore()
    const prefs = usePrefsStore()
    const ui = useUiStore()
    /** Set in the GitHub, AWS and SSH windows: they read the saved settings but never write them or run the workspace. */
    const tool = toolKind

    // ---------- Which tool windows are showing ----------
    // First, so a window that opened before this page finished loading still learns it is showing.
    const applyTools = (s: ToolState) => {
      ui.gh = s.gh
      ui.aws = s.aws
      ui.ssh = s.ssh
    }
    api.tool.onState(applyTools)
    api.tool.state().then((s) => { if (s) applyTools(s) })

    // ---------- Saved state ----------
    // Demo mode (npm run dev:demo) starts from made-up data and never saves.
    const demo = isDemo()
    const saved = demo ? null : await api.state.load().catch(() => null)
    if (saved) {
      P.projects = (saved.projects || []).map(p => ({ ...p, repos: p.repos.map(r => ({ ...r, services: r.services || [] })) }))
      // Before P.sel, so selecting the project restores its panel.
      ui.panels = Object.fromEntries(Object.entries(saved.panels || {}).filter(([pid]) => P.byId(pid)))
      ui.previews = Object.fromEntries(Object.entries(saved.previews || {}).filter(([pid]) => P.byId(pid)))
      P.sel = saved.sel && P.byId(saved.sel) ? saved.sel : (P.projects[0]?.id ?? null)
      prefs.prefs = { ...prefs.prefs, ...(saved.prefs || {}) }
      prefs.keys = saved.keys || {}
      prefs.theme = saved.theme || 'dark'
      ui.stripOn = saved.stripOn ?? true
      ui.sshSaved = (saved.sessions || []).filter(x => x.win === 'ssh')
      ui.recaps = recent(saved.recaps)
      ui.recapHours = recent(saved.recapHours)
    }

    let saveT: ReturnType<typeof setTimeout> | undefined
    /** Until saved sessions are reopened, keep writing the saved list so an early save can't drop it. */
    let reopened = false
    const snapshot = (): Persisted => plain({
      projects: P.projects, prefs: prefs.prefs, keys: prefs.keys, theme: prefs.theme, sel: P.sel, stripOn: ui.stripOn,
      sessions: reopened ? [...S.saved, ...ui.sshSaved] : (saved?.sessions || []), focus: reopened ? S.focus : (saved?.focus || {}),
      recaps: ui.recaps, recapHours: ui.recapHours, panels: ui.panels, previews: ui.previews,
    })
    /** When the first unsaved change came; saves wait for a quiet moment, but never longer than SAVE_MAX after it. */
    let dirtySince = 0
    const SAVE_MAX = 2000
    // One string of everything saved: the watcher fires only when it really changes, not on every session update.
    if (!tool) watch(() => JSON.stringify([P.projects, P.sel, prefs.prefs, prefs.keys, prefs.theme, ui.stripOn, S.saved, S.focus, ui.sshSaved, ui.recaps, ui.recapHours, ui.panels, ui.previews]), () => {
      if (demo) return
      const now = Date.now()
      dirtySince ||= now
      clearTimeout(saveT)
      saveT = setTimeout(() => {
        dirtySince = 0
        api.state.save(snapshot())
      }, Math.max(0, Math.min(300, dirtySince + SAVE_MAX - now)))
    })

    // ---------- Terminals ----------
    // Terminal colours come from a probe scoped to the terminal's own theme (panes can stay dark in light mode).
    const probe = document.createElement('div')
    probe.style.display = 'none'
    document.body.appendChild(probe)
    const css = (name: string) => {
      probe.className = prefs.terminalDark ? 'dark' : 'light'
      return getComputedStyle(probe).getPropertyValue(name).trim()
    }
    const fontName = (v: string, fallback: string) => (v || '').trim().replace(/['";]/g, '') || fallback
    const termFont = () => fontName(prefs.prefs.termFont, DEFAULT_PREFS.termFont)
    const monoStack = (font: string) => `'${font}', 'JetBrains Mono', '${NERD_SYMBOLS}', ui-monospace, monospace`
    const TEXT = { dim: '--ttx-dim', normal: '--ttx', bright: '--ttx-bright' } as const
    const termOptions = () => {
      const p = prefs.prefs
      const fg = css(TEXT[p.termBrightness] || '--ttx')
      return {
        fontFamily: monoStack(termFont()),
        fontSize: p.termSize || DEFAULT_PREFS.termSize,
        lineHeight: p.termLineHeight || DEFAULT_PREFS.termLineHeight,
        fontWeight: p.termWeight || DEFAULT_PREFS.termWeight,
        fontWeightBold: p.termWeightBold || DEFAULT_PREFS.termWeightBold,
        letterSpacing: p.termLetterSpacing ?? 0,
        minimumContrastRatio: p.termContrast ? 4.5 : 1,
        drawBoldTextInBrightColors: p.termBoldBright ?? true,
        cursor: p.cursor,
        cursorBlink: p.cursorBlink ?? true,
        scrollback: Math.max(100, parseInt(p.scrollback, 10) || 3000),
        theme: { background: css('--term'), foreground: fg, cursor: fg, selection: prefs.terminalDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)', ansi: prefs.terminalDark ? undefined : LIGHT_ANSI },
      }
    }
    setTerminalOptions(termOptions())
    watch(() => {
      const p = prefs.prefs
      // A string, so unrelated prefs changes (such as dragging the dock panel's edge) don't restyle every terminal.
      return [p.termFont, p.termSize, p.termLineHeight, p.termWeight, p.termWeightBold, p.termLetterSpacing, p.termBrightness, p.termContrast, p.termBoldBright, p.cursor, p.cursorBlink, p.scrollback, prefs.resolvedTheme, prefs.terminalDark].join('|')
    }, () => {
      const font = termFont()
      document.documentElement.style.setProperty('--mono', monoStack(font))
      // Bundled fonts load on first use; wait for them so xterm measures the cells with the right font.
      const o = termOptions()
      Promise.all([`${o.fontWeight} ${o.fontSize}px '${font}'`, `${o.fontWeightBold} ${o.fontSize}px '${font}'`, `${o.fontSize}px '${NERD_SYMBOLS}'`].map(f => document.fonts.load(f)))
        .catch(() => {})
        .then(() => nextTick(() => setTerminalOptions(termOptions())))
    }, { immediate: true })
    watch(() => prefs.prefs.appFont, (f) => {
      document.documentElement.style.setProperty('--app-font', `'${fontName(f, DEFAULT_PREFS.appFont)}','Outfit',system-ui,sans-serif`)
    }, { immediate: true })

    configureTerminals({
      isAppKey: (e) => {
        const cb = comboOf(e)
        if (!cb) return false
        if (/^Alt\+[1-9]$/.test(cb)) return true
        // In an AWS terminal, the key that leaves it running stays with the window.
        return !!matchAction(prefs.keys, cb) || (ui.sim && !!matchAction(prefs.keys, cb, 'sim')) || (tool === 'aws' && matchAction(prefs.keys, cb, 'aws') === 'awsDetach') || (tool === 'ssh' && matchAction(prefs.keys, cb, 'ssh') === 'sshDetach')
      },
      onImagePaste: (sid, f) => { if (S.byId(sid)?.kind !== 'shell') S.addImage(sid, f) },
      onImageHover: (sid, n, x, y) => { ui.hoverImg = n == null ? null : { sid, n, x, y } },
      onImageClick: (sid, n) => ui.openLightbox(sid, n),
      onFocus: (sid) => {
        const s = S.byId(sid)
        if (s && S.focusedId(s.pid) !== sid) S.setFocus(s.pid, sid)
      },
      // Enter in an ended pane brings it back: the Claude conversation, or a fresh shell.
      onInput: (sid, d) => {
        const s = S.byId(sid)
        if (!s?.exited) return false
        if (d === '\r') S.resume(sid)
        return true
      },
      openUrl: url => api.sys.openExternal(url),
    })

    // ---------- Settings shared between windows ----------
    // A change in one window reaches the others through the main process; the main window saves them.
    // The AWS and SSH windows add what the main window needs from them: the profile the data centre follows,
    // what the title bar buttons count, and the SSH connections to save.
    const extra = (): Partial<SharedState> => {
      if (tool === 'aws') {
        const A = useAwsStore()
        return {
          aws: A.profile && A.region ? { profile: A.profile, region: A.region } : undefined,
          badges: { aws: { terms: A.terms.filter(t => !t.exited).length, sso: A.ssoExpired } },
        }
      }
      if (tool === 'ssh') return { sshSaved: S.saved, badges: { ssh: S.sessions.filter(x => x.sshId && !x.exited).length } }
      return {}
    }
    if (!demo) {
      const base = () => ({ prefs: prefs.prefs, keys: prefs.keys, theme: prefs.theme, ...(tool ? {} : { projects: P.projects, sel: P.sel }), ...extra() })
      const shared = () => JSON.stringify(base())
      const payload = (): SharedState => plain(base())
      let last = shared()
      let pushT: ReturnType<typeof setTimeout> | undefined
      watch(shared, (s) => {
        // What just arrived from another window isn't sent back.
        if (s === last) return
        last = s
        clearTimeout(pushT)
        pushT = setTimeout(() => api.sync.push(payload()), 150)
      })
      api.sync.onPush((s) => {
        prefs.prefs = { ...DEFAULT_PREFS, ...(s.prefs as object) }
        prefs.keys = (s.keys as typeof prefs.keys) || {}
        prefs.theme = (s.theme as typeof prefs.theme) || 'dark'
        if (s.projects) P.projects = s.projects as typeof P.projects
        if (tool && s.sel !== undefined) P.sel = s.sel
        if (!tool) {
          if (s.aws) {
            const A = useAwsStore()
            A.profile = s.aws.profile
            A.region = s.aws.region
          }
          if (s.badges?.aws) ui.badge = { ...ui.badge, awsTerms: s.badges.aws.terms, sso: s.badges.aws.sso }
          if (s.badges?.ssh !== undefined) ui.badge = { ...ui.badge, ssh: s.badges.ssh }
          if (s.sshSaved) ui.sshSaved = s.sshSaved as typeof ui.sshSaved
        }
        last = shared()
      })
      if (tool) api.sync.request()
      else api.sync.onRequest(() => api.sync.push(payload()))
    }

    // ---------- The GitHub, AWS and SSH windows ----------
    if (tool) {
      setInterval(() => { ui.now = Date.now() }, 1000)
      window.addEventListener('resize', () => { ui.width = window.innerWidth })
      if (tool === 'gh') {
        // Sent by the main window: a review notification goes to that pull request.
        const G = useGithubStore()
        const run = (c: ToolCmd) => {
          if (c.go) G.go(c.go as GhTab)
          if (c.pull) G.openPull(c.pull)
        }
        api.tool.onCmd(run)
        api.tool.ready('gh').then(list => list.forEach(run))
      } else if (tool === 'aws') {
        // Sent by the main window: the 3D World's data centre opens a profile or a service.
        const A = useAwsStore()
        api.pty.onExit((id, code) => A.onTermExit(id, code))
        const run = async (c: ToolCmd) => {
          if (!A.ready) await A.init()
          if (c.awsProfile && c.awsProfile !== A.profile) A.useProfile(c.awsProfile)
          if (c.awsJump) A.jumpTo(c.awsJump.tab as AwsTab, c.awsJump.query)
          else if (c.awsGo) A.go(c.awsGo as AwsTab)
        }
        api.tool.onCmd(run)
        api.tool.ready('aws').then(list => list.forEach(run))
      } else {
        // SSH: the connections that were open at quit come back here, and the main window can ask for a new one.
        api.pty.onExit((id, code) => S.onExit(id, code))
        if (prefs.prefs.resume && !demo) S.reopen((saved?.sessions || []).filter(x => x.win === 'ssh'))
        const run = (c: ToolCmd) => { if (c.ssh) ui.openSshTerminal(c.ssh) }
        api.tool.onCmd(run)
        api.tool.ready('ssh').then(list => list.forEach(run))
      }
      return
    }
    api.tool.onMainCmd((c) => { if (c.settings) ui.openSettings(c.settings as SettingsTab) })

    // ---------- Main process events ----------
    api.session.onHook(e => S.onHook(e))
    api.session.onUsage(u => S.onUsage(u))
    api.pty.onExit((id, code) => (id.startsWith('aws-') ? useAwsStore().onTermExit(id, code) : S.onExit(id, code)))
    api.svc.onData((id, d) => V.onData(id, d))
    api.svc.onStatus((id, s, code) => V.onStatus(id, s, code))
    api.svc.onPort((id, port) => V.onPort(id, String(port)))
    api.sys.onNotifyClick((sid) => {
      // A review request: the GitHub window, on that PR when the notification was about one.
      const [kind, url] = sid.split('|')
      if (kind !== GH_NOTIFY) return ui.focusSession(sid)
      ui.openGithub({ go: 'reviews', pull: url || undefined })
    })
    api.sys.onNotifyAction?.((sid, key) => ui.answer(sid, key))
    api.upd.onStatus((s) => { ui.upd = s })
    api.upd.state().then((s) => { if (s) ui.upd = s })

    // ---------- Window size and clock ----------
    const onResize = () => { ui.width = window.innerWidth }
    window.addEventListener('resize', onResize)
    setInterval(() => {
      ui.now = Date.now()
      ui.inboxTick()
    }, 1000)

    // ---------- Plan usage ----------
    const pollUsage = () => api.usage().then((u) => { ui.usage = u }).catch(() => {})
    pollUsage()
    setInterval(pollUsage, 120_000)

    // ---------- Pull requests waiting for my review ----------
    const R = useReviewsStore()
    R.start()
    // Approving or merging in the GitHub view clears them sooner than the next check.
    watch(() => ui.gh, (on) => { if (!on) setTimeout(R.poll, 2000) })

    // ---------- Git status for the selected project's sessions and repos ----------
    // Claude's edits and the end of a turn refresh it as they happen (see onHook), so this poll only catches the rest: Bash commands,
    // edits in an editor, git in a terminal. Coming back to the window checks at once.
    // Not while the window is hidden or minimised: nobody sees it, and each poll starts git processes.
    const pollGit = () => {
      const p = P.current
      if (!p || document.hidden) return
      const cwds = new Set<string>([...p.repos.map(r => r.path), ...S.ofProject(p.id).map(s => s.cwd)])
      cwds.forEach(c => G.refresh(c))
    }
    setInterval(pollGit, 15_000)
    watch(() => P.sel, pollGit, { immediate: true })
    document.addEventListener('visibilitychange', pollGit)
    window.addEventListener('focus', pollGit)

    if (demo) {
      // Fake sessions only: nothing to resume, and nothing that starts Claude.
      seedDemo()
      reopened = true
      ui.toast({ title: 'Demo mode', body: 'Made-up projects and sessions. Nothing runs and nothing is saved.' })
      return
    }

    // ---------- Resume on launch ----------
    // Sessions open at quit come back as they were: each Claude session resumes its own conversation.
    // The SSH window brings its own connections back.
    const restore = prefs.prefs.resume ? (saved?.sessions || []).filter(x => !x.win) : []
    if (restore.length) {
      S.reopen(restore)
      S.focus = { ...(saved?.focus || {}) }
    }
    reopened = true
    // Projects with nothing to reopen fall back to "start all sessions when I open this project".
    const restoredPids = new Set(restore.map(x => x.pid))
    if (prefs.prefs.resume) P.projects.filter(p => p.resume && !restoredPids.has(p.id)).forEach(p => ui.resumeOnce.add(p.id))
    const first = P.current
    if (first?.autoStart && prefs.prefs.resume && !restoredPids.has(first.id)) nextTick(() => ui.startAll(first.id))
  },
})
