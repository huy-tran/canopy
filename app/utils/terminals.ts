// xterm instances live here, outside Vue, so they survive layout and project switches.
// Panes attach a terminal's element into their host and detach it on unmount.
import { Terminal, type FontWeight, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { api } from './bridge'

export interface TermHooks {
  /** True when the key event is an app shortcut and must not reach the terminal. */
  isAppKey(e: KeyboardEvent): boolean
  onImagePaste(sid: string, file: File): void
  onImageHover(sid: string, n: number | null, x: number, y: number): void
  onImageClick(sid: string, n: number): void
  onFocus(sid: string): void
  openUrl(url: string): void
}

export interface TermOptions {
  fontFamily: string
  fontSize: number
  lineHeight: number
  fontWeight: number
  fontWeightBold: number
  letterSpacing: number
  minimumContrastRatio: number
  drawBoldTextInBrightColors: boolean
  cursor: 'Block' | 'Bar' | 'Underline'
  cursorBlink: boolean
  scrollback: number
  theme: { background: string; foreground: string; cursor: string; selection: string; ansi?: Record<string, string> }
}

interface Entry {
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  opened: boolean
  ro: ResizeObserver | null
  /** The GPU renderer, held only while the terminal is in a pane. */
  gl: WebglAddon | null
  /** A fit waiting for the next frame. */
  fitRaf: number
}

const entries = new Map<string, Entry>()
if (import.meta.dev && typeof window !== 'undefined') (window as any).__canopyTerms = entries
let hooks: TermHooks | null = null
let opts: TermOptions | null = null
let wired = false
/** Set once WebGL fails to start, so terminals stay on the DOM renderer. */
let noGl = false

const CURSOR = { Block: 'block', Bar: 'bar', Underline: 'underline' } as const

/** Terminals drawn see-through wherever they are shown, such as in the workspace simulation's session window. */
const seeThrough = new Set<string>()

function xtermOptions(o: TermOptions, transparent = false) {
  return {
    fontFamily: o.fontFamily,
    fontSize: o.fontSize,
    lineHeight: o.lineHeight,
    fontWeight: o.fontWeight as FontWeight,
    fontWeightBold: o.fontWeightBold as FontWeight,
    letterSpacing: o.letterSpacing,
    minimumContrastRatio: o.minimumContrastRatio,
    drawBoldTextInBrightColors: o.drawBoldTextInBrightColors,
    cursorStyle: CURSOR[o.cursor],
    cursorBlink: o.cursorBlink,
    scrollback: o.scrollback,
    allowProposedApi: true,
    allowTransparency: transparent,
    theme: {
      background: transparent ? 'rgba(0,0,0,0)' : o.theme.background,
      foreground: o.theme.foreground,
      cursor: o.theme.cursor,
      cursorAccent: o.theme.background,
      selectionBackground: o.theme.selection,
      ...o.theme.ansi,
    },
  }
}

export function configureTerminals(h: TermHooks) {
  hooks = h
  if (wired) return
  wired = true
  api.pty.onData((id, d) => entries.get(id)?.term.write(d))
}

/** Options that change the cell size, so the terminal needs fitting again. */
const METRIC_KEYS = ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'fontWeight', 'fontWeightBold'] as const
const PLAIN_KEYS = [...METRIC_KEYS, 'minimumContrastRatio', 'drawBoldTextInBrightColors', 'cursorStyle', 'cursorBlink', 'scrollback', 'allowTransparency'] as const

/** Applies only the options that changed: setting any (above all the theme) makes xterm redraw, and with WebGL rebuild its glyphs. */
function applyOptions(e: Entry, x: ReturnType<typeof xtermOptions>) {
  const cur = e.term.options as Record<string, unknown>
  let refit = false
  for (const k of PLAIN_KEYS) {
    if (cur[k] === x[k]) continue
    cur[k] = x[k]
    if ((METRIC_KEYS as readonly string[]).includes(k)) refit = true
  }
  if (JSON.stringify(e.term.options.theme) !== JSON.stringify(x.theme)) e.term.options.theme = x.theme
  if (refit && e.opened) queueFit(e)
}

export function setTerminalOptions(o: TermOptions) {
  opts = o
  for (const [sid, e] of entries) applyOptions(e, xtermOptions(o, seeThrough.has(sid)))
}

/** Draws a terminal see-through, or back to its usual background. */
export function setSeeThrough(sid: string, on: boolean) {
  if (on === seeThrough.has(sid)) return
  if (on) seeThrough.add(sid)
  else seeThrough.delete(sid)
  const e = entries.get(sid)
  if (!e || !opts) return
  applyOptions(e, xtermOptions(opts, on))
}

function safeFit(e: Entry) {
  if (!e.el.isConnected || !e.el.clientWidth || !e.el.clientHeight) return
  try {
    e.fit.fit()
  } catch {
    // Not measurable yet.
  }
}

/** Fits on the next frame, once however many size changes came before it. */
function queueFit(e: Entry) {
  if (e.fitRaf) return
  e.fitRaf = requestAnimationFrame(() => {
    e.fitRaf = 0
    safeFit(e)
  })
}

/**
 * Terminals that just left their pane but keep their WebGL context, oldest first, so switching back
 * doesn't rebuild it. Kept few: Chromium caps contexts per page, and visible panes and the 3D World need theirs.
 */
const warm: Entry[] = []
const WARM_MAX = 4

function keepWarm(e: Entry) {
  if (!e.gl) return
  warm.push(e)
  while (warm.length > WARM_MAX) disableGl(warm[0]!)
}

/** Draws with WebGL while in a pane. Hidden terminals let go of their context after a while (see `warm`). */
function enableGl(e: Entry) {
  const i = warm.indexOf(e)
  if (i >= 0) warm.splice(i, 1)
  if (e.gl || noGl) return
  try {
    const gl = new WebglAddon()
    gl.onContextLoss(() => disableGl(e))
    e.term.loadAddon(gl)
    e.gl = gl
  } catch {
    noGl = true
  }
}

function disableGl(e: Entry) {
  const i = warm.indexOf(e)
  if (i >= 0) warm.splice(i, 1)
  e.gl?.dispose()
  e.gl = null
}

/** Highlights [Image #n] and @path mentions; images preview on hover and open on click. */
function linkProvider(sid: string, term: Terminal) {
  return {
    provideLinks(y: number, cb: (links: ILink[] | undefined) => void) {
      const line = term.buffer.active.getLine(y - 1)
      if (!line) return cb(undefined)
      const text = line.translateToString(true)
      const links: ILink[] = []
      const re = /\[Image #(\d+)\]|@[\w./\\\-[\]]+/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        const n = m[1] ? +m[1] : null
        const start = m.index + 1
        links.push({
          range: { start: { x: start, y }, end: { x: start + m[0].length - 1, y } },
          text: m[0],
          decorations: { underline: true, pointerCursor: n != null },
          activate: () => { if (n != null) hooks?.onImageClick(sid, n) },
          hover: (ev: MouseEvent) => { if (n != null) hooks?.onImageHover(sid, n, ev.clientX, ev.clientY) },
          leave: () => { if (n != null) hooks?.onImageHover(sid, null, 0, 0) },
        })
      }
      cb(links.length ? links : undefined)
    },
  }
}

export function ensureTerminal(sid: string): Entry {
  let e = entries.get(sid)
  if (e) return e
  const term = new Terminal(xtermOptions(opts!, seeThrough.has(sid)))
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_ev, url) => hooks?.openUrl(url)))
  term.registerLinkProvider(linkProvider(sid, term))
  const el = document.createElement('div')
  el.style.cssText = 'width:100%;height:100%;'
  term.onData(d => api.pty.write(sid, d))
  // Claude redraws its whole screen on every resize, so dragging a pane edge only tells it the size it settles on.
  let resizeT: ReturnType<typeof setTimeout> | undefined
  term.onResize(({ cols, rows }) => {
    clearTimeout(resizeT)
    resizeT = setTimeout(() => api.pty.resize(sid, cols, rows), 120)
  })
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true
    if (hooks?.isAppKey(ev)) return false
    // Let the browser fire a paste event so text and screenshots both work.
    if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && ev.code === 'KeyV') return false
    if (ev.ctrlKey && !ev.altKey && !ev.shiftKey && ev.code === 'KeyC' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection()).catch(() => {})
      term.clearSelection()
      return false
    }
    return true
  })
  e = { term, fit, el, opened: false, ro: null, gl: null, fitRaf: 0 }
  entries.set(sid, e)
  return e
}

/** Moves the terminal into a pane and sizes it. */
export function attachTerminal(sid: string, host: HTMLElement) {
  const e = ensureTerminal(sid)
  if (e.el.parentElement !== host) host.appendChild(e.el)
  if (!e.opened) {
    e.term.open(e.el)
    e.opened = true
    const ta = e.el.querySelector('textarea')
    ta?.addEventListener('paste', (ev: ClipboardEvent) => {
      const items = ev.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile()
          if (!f) continue
          ev.preventDefault()
          ev.stopImmediatePropagation()
          hooks?.onImagePaste(sid, f)
          return
        }
      }
    }, true)
    ta?.addEventListener('focus', () => hooks?.onFocus(sid))
  }
  enableGl(e)
  e.ro?.disconnect()
  e.ro = new ResizeObserver(() => queueFit(e))
  e.ro.observe(host)
  queueFit(e)
}

export function detachTerminal(sid: string, host: HTMLElement) {
  const e = entries.get(sid)
  if (!e) return
  if (e.el.parentElement === host) {
    e.ro?.disconnect()
    e.ro = null
    keepWarm(e)
    host.removeChild(e.el)
  }
}

export function disposeTerminal(sid: string) {
  seeThrough.delete(sid)
  const e = entries.get(sid)
  if (!e) return
  e.ro?.disconnect()
  cancelAnimationFrame(e.fitRaf)
  disableGl(e)
  e.term.dispose()
  e.el.remove()
  entries.delete(sid)
}

export function focusTerminal(sid: string) {
  const e = entries.get(sid)
  if (e?.opened) e.term.focus()
}

/** Inserts text at Claude's prompt without sending it. */
export function pasteInto(sid: string, text: string) {
  const e = ensureTerminal(sid)
  e.term.paste(text)
}

export function writeToTerminal(sid: string, text: string) {
  ensureTerminal(sid).term.write(text)
}

export function terminalSize(sid: string) {
  const e = entries.get(sid)
  return e ? { cols: e.term.cols, rows: e.term.rows } : { cols: 120, rows: 30 }
}

export interface PromptOption {
  /** The key that picks it, e.g. "1". */
  key: string
  /** The option as Claude shows it, e.g. "Yes, allow all edits during this session". */
  text: string
  /** A short button label: Yes, Always or No. */
  label: string
}

/**
 * The numbered choices of the prompt Claude is showing (permission or question), read from the screen,
 * so buttons match what Claude actually offers. Empty when no numbered choice list is visible.
 */
export function promptOptions(sid: string): PromptOption[] {
  const e = entries.get(sid)
  if (!e) return []
  const b = e.term.buffer.active
  const from = Math.max(0, b.length - 40)
  const found: PromptOption[] = []
  for (let y = from; y < b.length; y++) {
    const line = b.getLine(y)?.translateToString(true) || ''
    const m = line.match(/^\s*(?:[❯>›]\s*)?([1-9])\.\s+(.+?)\s*$/)
    if (!m) continue
    const key = m[1]!, text = m[2]!.replace(/\s*\((?:esc|shift\+tab|tab)\)\s*$/i, '').trim()
    // A new list starts at 1; keep only the last one on screen.
    if (key === '1') found.length = 0
    if (+key === found.length + 1) found.push({ key, text, label: '' })
  }
  if (found.length < 2) return []
  return found.map((o, i) => ({
    ...o,
    label: /^no\b/i.test(o.text) ? 'No' : /^yes\b/i.test(o.text) ? (i === 0 ? 'Yes' : 'Always') : o.text.split(/\s+/).slice(0, 3).join(' '),
  }))
}
