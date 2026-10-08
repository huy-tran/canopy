// Boots the workspace: loads saved state, wires main-process events, and runs the timers.
import type { Persisted } from '#shared/types'
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

    // ---------- Saved state ----------
    const saved = await api.state.load().catch(() => null)
    if (saved) {
      P.projects = (saved.projects || []).map(p => ({ ...p, repos: p.repos.map(r => ({ ...r, services: r.services || [] })) }))
      // Before P.sel, so selecting the project restores its panel.
      ui.panels = Object.fromEntries(Object.entries(saved.panels || {}).filter(([pid]) => P.byId(pid)))
      P.sel = saved.sel && P.byId(saved.sel) ? saved.sel : (P.projects[0]?.id ?? null)
      prefs.prefs = { ...prefs.prefs, ...(saved.prefs || {}) }
      prefs.keys = saved.keys || {}
      prefs.theme = saved.theme || 'dark'
      ui.stripOn = saved.stripOn ?? true
      ui.recaps = recent(saved.recaps)
      ui.recapHours = recent(saved.recapHours)
    }

    let saveT: ReturnType<typeof setTimeout> | undefined
    /** Until saved sessions are reopened, keep writing the saved list so an early save can't drop it. */
    let reopened = false
    const snapshot = (): Persisted => JSON.parse(JSON.stringify({
      projects: P.projects, prefs: prefs.prefs, keys: prefs.keys, theme: prefs.theme, sel: P.sel, stripOn: ui.stripOn,
      sessions: reopened ? S.saved : (saved?.sessions || []), focus: reopened ? S.focus : (saved?.focus || {}),
      recaps: ui.recaps, recapHours: ui.recapHours, panels: ui.panels,
    }))
    watch(() => [P.projects, P.sel, prefs.prefs, prefs.keys, prefs.theme, ui.stripOn, JSON.stringify(S.saved), S.focus, ui.recaps, ui.recapHours, ui.panels], () => {
      clearTimeout(saveT)
      saveT = setTimeout(() => api.state.save(snapshot()), 300)
    }, { deep: true })

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
        scrollback: Math.max(100, parseInt(p.scrollback, 10) || 5000),
        theme: { background: css('--term'), foreground: fg, cursor: fg, selection: prefs.terminalDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)', ansi: prefs.terminalDark ? undefined : LIGHT_ANSI },
      }
    }
    setTerminalOptions(termOptions())
    watch(() => {
      const p = prefs.prefs
      return [p.termFont, p.termSize, p.termLineHeight, p.termWeight, p.termWeightBold, p.termLetterSpacing, p.termBrightness, p.termContrast, p.termBoldBright, p.cursor, p.cursorBlink, p.scrollback, prefs.resolvedTheme, prefs.terminalDark]
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
      isAppKey: (e, sid) => {
        const cb = comboOf(e)
        if (!cb) return false
        if (/^Alt\+[1-9]$/.test(cb)) return true
        const id = matchAction(prefs.keys, cb)
        // gh-tui's own keys are Ctrl plus a letter (Ctrl K palette, Ctrl R re-run...): those reach it, bar its toggle and quit.
        if (sid === GH_TERM && /^Ctrl\+[A-Z]$/.test(cb) && id !== 'github' && id !== 'quit') return false
        return !!id || (ui.sim && !!matchAction(prefs.keys, cb, 'sim'))
      },
      onImagePaste: (sid, f) => { if (sid !== GH_TERM && S.byId(sid)?.kind !== 'shell') S.addImage(sid, f) },
      onImageHover: (sid, n, x, y) => { ui.hoverImg = n == null ? null : { sid, n, x, y } },
      onImageClick: (sid, n) => ui.openLightbox(sid, n),
      onFocus: (sid) => {
        const s = S.byId(sid)
        if (s && S.focusedId(s.pid) !== sid) S.setFocus(s.pid, sid)
      },
      openUrl: url => api.sys.openExternal(url),
    })

    // ---------- Main process events ----------
    api.session.onHook(e => S.onHook(e))
    api.session.onUsage(u => S.onUsage(u))
    api.pty.onExit((id, code) => (id === GH_TERM ? ui.onGithubExit(code) : S.onExit(id, code)))
    api.svc.onData((id, d) => V.onData(id, d))
    api.svc.onStatus((id, s, code) => V.onStatus(id, s, code))
    api.sys.onNotifyClick(sid => (sid === GH_TERM ? ui.openGithub() : ui.focusSession(sid)))
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
    const pollGit = () => {
      const p = P.current
      if (!p) return
      const cwds = new Set<string>([...p.repos.map(r => r.path), ...S.ofProject(p.id).map(s => s.cwd)])
      cwds.forEach(c => G.refresh(c))
    }
    setInterval(pollGit, 5000)
    watch(() => P.sel, pollGit, { immediate: true })

    // ---------- Resume on launch ----------
    // Sessions open at quit come back as they were: each Claude session resumes its own conversation.
    const restore = prefs.prefs.resume ? (saved?.sessions || []) : []
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
