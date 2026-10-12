// The tray icon, launch at login and the global summon shortcut.
import { app, globalShortcut, Menu, Tray } from 'electron'
import { logoImage, prefs, showWindow, state } from './context'

let loginItem: boolean | undefined

export function applyLoginItem() {
  const p = prefs()
  if (!p || !app.isPackaged || loginItem === !!p.launchLogin) return
  loginItem = !!p.launchLogin
  app.setLoginItemSettings({ openAtLogin: loginItem })
}

export function ensureTray() {
  const want = !!prefs()?.tray
  if (want && !state.tray) {
    state.tray = new Tray(logoImage(16))
    state.tray.setToolTip('Canopy')
    state.tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Canopy', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => { state.quitting = true; app.quit() } },
    ]))
    state.tray.on('click', () => showWindow())
  } else if (!want && state.tray) {
    state.tray.destroy()
    state.tray = null
  }
}

// ---------- Global summon shortcut ----------

const ACCEL_KEYS: Record<string, string> = { '→': 'Right', '←': 'Left', '↑': 'Up', '↓': 'Down', 'Esc': 'Escape' }
let summonCombo = ''
let summonOk = true

/** Brings the window to the front, or tucks it away when it already has focus. */
function toggleWindow() {
  if (!state.win) return
  if (state.win.isVisible() && !state.win.isMinimized() && state.win.isFocused()) {
    if (prefs()?.tray) state.win.hide()
    else state.win.minimize()
  } else showWindow()
}

/** "Ctrl+Alt+→" -> Electron accelerator "Ctrl+Alt+Right". */
function toAccelerator(combo: string) {
  return combo.split('+').map(k => ACCEL_KEYS[k] || k).join('+')
}

/** Registers the summon shortcut; false when another app already holds it. */
export function applySummonKey(combo: string) {
  if (combo === summonCombo && summonOk) return true
  if (summonCombo && summonOk) globalShortcut.unregister(toAccelerator(summonCombo))
  summonCombo = combo
  summonOk = true
  if (!combo) return true
  try {
    summonOk = globalShortcut.register(toAccelerator(combo), toggleWindow)
  } catch {
    summonOk = false
  }
  return summonOk
}
