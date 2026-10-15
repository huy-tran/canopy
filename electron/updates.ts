// Checking for, downloading and installing updates.
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '../shared/types'
import { errMessage } from '../shared/errors'
import { handle, prefs, send, state } from './context'

const { autoUpdater } = electronUpdater

let upd: UpdateState | null = null

function setUpd(s: UpdateState) {
  upd = s
  send('upd:status', s)
}

export function wireUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.on('update-available', (i) => {
    const notes = typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '\n').split('\n').map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean).slice(0, 5) : []
    const total = i.files?.reduce((a, f) => a + (f.size || 0), 0) || 0
    setUpd({ status: 'available', version: i.version, notes, total })
    if (prefs()?.autoUpdate) autoUpdater.downloadUpdate().catch(() => undefined)
  })
  autoUpdater.on('update-not-available', () => setUpd({ status: 'current' }))
  autoUpdater.on('download-progress', p => setUpd({ ...(upd || { status: 'downloading' }), status: 'downloading', pct: p.percent, total: p.total }))
  autoUpdater.on('update-downloaded', i => setUpd({ ...(upd || {}), status: 'ready', version: i.version }))
  autoUpdater.on('error', e => setUpd({ status: 'error', error: errMessage(e) }))
}

export async function checkUpdates() {
  setUpd({ status: 'checking' })
  // Linux updates itself only as an AppImage; a package from the distro's own tools is updated by those.
  if (!app.isPackaged || (process.platform === 'linux' && !process.env.APPIMAGE)) {
    setTimeout(() => setUpd({ status: 'current' }), 900)
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    setUpd({ status: 'error', error: errMessage(e) })
  }
}

export function registerUpdateIpc() {
  handle('upd:check', () => checkUpdates())
  handle('upd:download', () => autoUpdater.downloadUpdate().catch(e => setUpd({ status: 'error', error: errMessage(e) })))
  handle('upd:install', () => {
    state.quitting = true
    autoUpdater.quitAndInstall()
  })
  handle('upd:state', () => upd)
}
