// Editors, folders, images, notifications, window controls and quitting.
import { app, dialog, Notification, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { handle, logoImage, send, showWindow, state } from '../context'
import { webUrl } from '../services/guard'
import { sampleMetrics } from '../services/metrics'
import { appInfo, copyImage, listFonts, listShells, openInEditor, saveImage, savedImage, showInFolder } from '../services/system'
import { applySummonKey } from '../tray'

/** Notifications still on screen; kept referenced so their button events arrive. */
const live = new Set<Notification>()

export function registerSystemIpc() {
  // Web links only: a link from outside (an AWS finding's remediation, say) never reaches another protocol handler.
  handle('sys:openExternal', (url: string) => {
    const link = webUrl(url)
    if (link) return shell.openExternal(link)
  })
  handle('sys:showInFolder', (p: string) => showInFolder(p))
  handle('sys:openEditor', (editor: string, folder: string, file?: string) => openInEditor(editor, folder, file))
  handle('sys:pickFolder', async () => {
    const r = await dialog.showOpenDialog(state.win!, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('sys:fonts', () => listFonts())
  handle('sys:shells', () => listShells())
  handle('sys:info', () => appInfo())
  handle('sys:metrics', () => sampleMetrics())
  handle('sys:saveImage', (sid: string, name: string, bytes: Uint8Array) => saveImage(sid, name, bytes))
  handle('sys:copyImage', (file: string) => copyImage(file))
  handle('sys:saveImageAs', async (file: string) => {
    savedImage(file)
    const r = await dialog.showSaveDialog(state.win!, { defaultPath: path.join(app.getPath('pictures'), path.basename(file)) })
    if (r.canceled || !r.filePath) return null
    fs.copyFileSync(file, r.filePath)
    return r.filePath
  })
  handle('sys:notify', (o: { title: string; body: string; sid?: string; silent?: boolean; actions?: { label: string; key: string }[] }) => {
    if (!Notification.isSupported()) return
    const actions = (o.actions || []).slice(0, 5)
    const n = new Notification({
      title: o.title, body: o.body, silent: !!o.silent, icon: logoImage(64),
      actions: actions.map(a => ({ type: 'button' as const, text: a.label })),
    })
    // Held until closed: a collected notification stops delivering its events.
    live.add(n)
    n.on('close', () => live.delete(n))
    n.on('click', () => {
      showWindow()
      if (o.sid) send('notify:click', o.sid)
    })
    // Buttons answer without opening the window (Windows and macOS).
    n.on('action', (e: any, index?: number) => {
      const i = typeof e?.actionIndex === 'number' ? e.actionIndex : index ?? -1
      const a = actions[i]
      if (a && o.sid) send('notify:action', o.sid, a.key)
    })
    n.show()
  })

  handle('win:minimize', () => state.win?.minimize())
  handle('win:toggleMaximize', () => (state.win?.isMaximized() ? state.win.unmaximize() : state.win?.maximize()))
  handle('win:close', () => state.win?.close())
  handle('win:isMaximized', () => !!state.win?.isMaximized())
  handle('win:summonKey', (combo: string) => applySummonKey(combo))
  handle('app:quit', () => {
    state.quitting = true
    app.quit()
  })
}
