// The GitHub, AWS and SSH windows: each its own OS window, so they can sit beside the Claude sessions.
// They load the same app as the main window (see ?win= in the renderer) and are hidden, not closed,
// so what they hold (SSH connections, an open pull request) is still there when they come back.
import { BrowserWindow } from 'electron'
import { TOOL_KINDS, type ToolCmd, type ToolKind, type ToolState } from '../shared/bridge'
import { broadcast, DEV_URL, DEMO, logoImage, state, store } from './context'
import { appWebPreferences, lockDown } from './window'

const TITLES: Record<ToolKind, string> = { gh: 'GitHub', aws: 'AWS', ssh: 'SSH' }
/** Commands sent to a window before its page said it was listening. */
const pending = new Map<ToolKind, ToolCmd[]>()
const ready = new Set<ToolKind>()
let destroying = false

export function toolKindOf(win: BrowserWindow | null): ToolKind | null {
  for (const [k, w] of state.tools) if (w === win) return k
  return null
}

export function isShowing(kind: ToolKind) {
  const w = state.tools.get(kind)
  return !!w && !w.isDestroyed() && w.isVisible() && !w.isMinimized()
}

export function toolState(): ToolState {
  return Object.fromEntries(TOOL_KINDS.map(k => [k, isShowing(k)])) as ToolState
}

/** Tells every window which tools are showing, for the title bar buttons and for each window's own idea of "open". */
function announce() {
  broadcast('tool:state', toolState())
}

/** Where the windows first sat: over the main window, as the overlays they replaced did. */
function overlayBounds(): Electron.Rectangle {
  const m = state.win && !state.win.isDestroyed() ? state.win.getBounds() : null
  if (!m) return { x: 0, y: 0, width: 1180, height: 820 }
  const width = Math.min(Math.round(m.width * 0.94), 1320)
  const height = Math.min(Math.round(m.height * 0.88), 920)
  return { x: Math.round(m.x + (m.width - width) / 2), y: Math.round(m.y + (m.height - height) / 2), width, height }
}

function createTool(kind: ToolKind, hidden = false) {
  const saved = store.get('toolBounds')?.[kind] ?? overlayBounds()
  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 560,
    minHeight: 420,
    frame: false,
    backgroundColor: '#0F1012',
    icon: logoImage(256),
    title: `Canopy - ${TITLES[kind]}`,
    show: false,
    webPreferences: appWebPreferences(),
  })
  state.tools.set(kind, win)
  if ('maximized' in saved && saved.maximized) win.maximize()
  win.once('ready-to-show', () => {
    if (!win.isDestroyed() && !hidden) {
      win.show()
      win.focus()
    }
  })
  // Same larger type as the main window.
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1.1))

  let t: ReturnType<typeof setTimeout> | undefined
  const writeBounds = () => {
    clearTimeout(t)
    if (win.isDestroyed()) return
    const all = store.get('toolBounds') || {}
    const prev = all[kind]
    store.set('toolBounds', {
      ...all,
      [kind]: win.isMaximized() || win.isMinimized() ? { ...(prev || win.getBounds()), maximized: win.isMaximized() } : { ...win.getBounds(), maximized: false },
    })
  }
  const saveBounds = () => {
    clearTimeout(t)
    t = setTimeout(writeBounds, 500)
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('close', (e) => {
    // The X hides it; only quitting, or the main window going, really closes it.
    if (state.quitting || destroying) {
      writeBounds()
      return
    }
    e.preventDefault()
    writeBounds()
    hideTool(kind)
  })
  win.on('maximize', () => win.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win.webContents.send('win:maximized', false))
  win.on('show', announce)
  win.on('hide', announce)
  win.on('minimize', announce)
  win.on('restore', announce)
  win.on('closed', () => {
    state.tools.delete(kind)
    ready.delete(kind)
    announce()
  })
  lockDown(win)
  const q = `?win=${kind}`
  if (DEV_URL) win.loadURL(DEMO ? `${DEV_URL}/${q}&demo=1` : `${DEV_URL}/${q}`)
  else win.loadURL(`app://canopy/index.html${q}`)
  return win
}

/** Puts a window back where it started, over the main window, at the old overlay's size. */
export function resetTool(kind: ToolKind) {
  const all = store.get('toolBounds') || {}
  const w = state.tools.get(kind)
  if (!w || w.isDestroyed()) {
    // Not made yet: forget where it was, so it opens in the original place.
    delete all[kind]
    store.set('toolBounds', all)
    return
  }
  if (w.isMaximized()) w.unmaximize()
  if (w.isMinimized()) w.restore()
  w.setBounds(overlayBounds())
}

/** Every tool window back in its original place. */
export function resetAllTools() {
  for (const k of TOOL_KINDS) resetTool(k)
}

/** At start-up: the SSH window opens hidden when it has connections to bring back, so they reconnect without it being shown. */
export function startTools() {
  const st = store.get('state')
  if (st?.prefs?.resume && st.sessions?.some(s => s.win === 'ssh')) createTool('ssh', true)
}

/** Shows the window (making it first if needed), in front and with the keyboard. */
export function showTool(kind: ToolKind, cmd?: ToolCmd) {
  if (cmd) sendCmd(kind, cmd)
  const w = state.tools.get(kind)
  if (!w || w.isDestroyed()) {
    createTool(kind)
    return
  }
  if (w.isMinimized()) w.restore()
  w.show()
  w.focus()
}

export function hideTool(kind: ToolKind) {
  const w = state.tools.get(kind)
  if (!w || w.isDestroyed()) return
  w.hide()
  // Back to the sessions, unless the main window is itself tucked away.
  if (state.win && !state.win.isDestroyed() && state.win.isVisible() && !state.win.isMinimized()) state.win.focus()
}

/**
 * The shortcut and the title bar buttons: hidden, it opens; open behind something, it comes forward;
 * in front, it hides. `strict` (a button click, which always takes focus first) opens or hides only.
 */
export function toggleTool(kind: ToolKind, strict = false) {
  const w = state.tools.get(kind)
  if (!w || w.isDestroyed() || !isShowing(kind)) return showTool(kind)
  if (!strict && !w.isFocused()) return w.focus()
  hideTool(kind)
}

function sendCmd(kind: ToolKind, cmd: ToolCmd) {
  const w = state.tools.get(kind)
  if (w && !w.isDestroyed() && ready.has(kind)) w.webContents.send('tool:cmd', cmd)
  else pending.set(kind, [...(pending.get(kind) || []), cmd])
}

/** The page is listening: hand over what waited, and send the rest as it comes. */
export function toolReady(kind: ToolKind) {
  ready.add(kind)
  const list = pending.get(kind) || []
  pending.delete(kind)
  return list
}

/** The main window is gone for good (or the app is quitting). */
export function destroyTools() {
  destroying = true
  for (const w of state.tools.values()) if (!w.isDestroyed()) w.destroy()
  state.tools.clear()
  destroying = false
}
