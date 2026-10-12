// State and helpers the main process modules share.
import { app, BrowserWindow, ipcMain, nativeImage, Tray } from 'electron'
import path from 'node:path'
import Store from 'electron-store'
import type { AwsWorld } from '../shared/aws'
import type { GhWorld, Persisted } from '../shared/types'
import { countIpc, countPty } from './services/metrics'

export const DEV_URL = process.env.CANOPY_DEV_URL
/** Dev only (npm run dev:demo): made-up projects and sessions, in a profile of its own. */
export const DEMO = !!DEV_URL && !!process.env.CANOPY_DEMO
// Dev only: a separate profile folder runs a second instance alongside the main one (used for UI testing).
if (DEV_URL && process.env.CANOPY_USER_DATA) app.setPath('userData', process.env.CANOPY_USER_DATA)
else if (DEMO) app.setPath('userData', path.join(app.getPath('appData'), 'canopy-demo'))

export const store = new Store<{ state?: Persisted; bounds?: Electron.Rectangle; maximized?: boolean }>({ name: 'canopy' })
/** GitHub HQ's last good read, so the 3D World and the GitHub window fill in at once on the next launch. */
export const ghCache = new Store<{ world?: GhWorld }>({ name: 'github-cache' })
/** The data centre's last good read, likewise for the 3D World and the AWS window. */
export const awsCache = new Store<{ world?: AwsWorld }>({ name: 'aws-cache' })

/** What the window, tray and quit logic share. */
export const state = {
  win: null as BrowserWindow | null,
  tray: null as Tray | null,
  quitting: false,
}

export function isAppUrl(url: string) {
  try {
    const u = new URL(url)
    if (DEV_URL) return u.origin === new URL(DEV_URL).origin
    return u.protocol === 'app:' && u.host === 'canopy'
  } catch {
    return false
  }
}

export function send(channel: string, ...args: unknown[]) {
  if (!state.win || state.win.isDestroyed()) return
  countIpc()
  state.win.webContents.send(channel, ...args)
}

export function showWindow() {
  if (!state.win) return
  if (state.win.isMinimized()) state.win.restore()
  state.win.show()
  state.win.focus()
}

/** Brand icon PNGs from public/brand (packaged under .output/public). */
export function logoImage(size: 16 | 24 | 32 | 48 | 64 | 128 | 256 | 512 = 32) {
  const dir = app.isPackaged ? path.join(__dirname, '..', '.output', 'public', 'brand') : path.join(__dirname, '..', 'public', 'brand')
  return nativeImage.createFromPath(path.join(dir, `canopy-${size}.png`))
}

export function prefs() {
  return store.get('state')?.prefs
}

/** Commands are only taken from the app's own window, never from a page or frame that ended up somewhere else. */
export function trusted(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  return !!state.win && e.sender === state.win.webContents && isAppUrl(e.senderFrame?.url || '')
}

export function handle(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error(`Blocked ${channel} from an unknown page.`)
    return fn(...args)
  })
}

export function ptyData(id: string, d: string) {
  countPty(d.length)
  send('pty:data', id, d)
}
