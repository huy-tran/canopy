import { app, globalShortcut, Menu } from 'electron'
import type { HookEvent } from '../shared/types'
import { prefs, send, showWindow, state } from './context'
import { registerAwsIpc } from './ipc/aws'
import { registerGithubIpc } from './ipc/github'
import { registerSystemIpc } from './ipc/system'
import { registerWorkspaceIpc } from './ipc/workspace'
import { serveApp } from './protocol'
import * as aws from './services/aws'
import { stopAllServices } from './services/devservers'
import { clearSessionSettings, startHookServer, stopHookServer } from './services/hooks'
import { killAllSessions } from './services/pty'
import { adoptLoginPath } from './services/shellcmd'
import { clearImages } from './services/system'
import { lastAssistantText, watchTranscript } from './services/transcript'
import { applySummonKey, ensureTray } from './tray'
import { checkUpdates, registerUpdateIpc, wireUpdater } from './updates'
import { createWindow } from './window'

if (!app.requestSingleInstanceLock()) app.quit()

if (process.platform === 'linux') {
  // Wayland compositors such as Hyprland: draw natively, and register the summon shortcut through the desktop portal.
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto')
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal')
}

app.on('second-instance', () => showWindow())

// ---------- Hooks: session status from Claude Code ----------

/** Hook events go out in the order they came, even when one waits on reading the transcript. */
let hookQueue = Promise.resolve()

function onHook(sid: string, event: string, payload: Record<string, any>) {
  const ev: HookEvent = { sid, event, payload }
  if (payload.transcript_path) watchTranscript(sid, String(payload.session_id || ''), String(payload.transcript_path), u => send('session:usage', u))
  hookQueue = hookQueue.then(async () => {
    if (event === 'Stop') ev.lastText = await lastAssistantText(sid)
    send('session:hook', ev)
  }).catch(() => undefined)
}

function registerIpc() {
  registerWorkspaceIpc()
  registerGithubIpc()
  registerAwsIpc()
  registerSystemIpc()
  registerUpdateIpc()
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.canopy.app')
  // An app started from a launcher or a keybinding often has a bare PATH, without claude, git or gh.
  await adoptLoginPath()
  Menu.setApplicationMenu(null)
  serveApp()
  clearSessionSettings()
  await startHookServer(onHook)
  wireUpdater()
  registerIpc()
  createWindow()
  ensureTray()
  applySummonKey(prefs()?.summonKey ?? 'Alt+Space')
  if (app.isPackaged && prefs()?.autoUpdate !== false) setTimeout(() => checkUpdates().catch(() => undefined), 8000)
})

app.on('before-quit', () => {
  state.quitting = true
  globalShortcut.unregisterAll()
  killAllSessions()
  aws.stopAllTails()
  stopAllServices()
  stopHookServer()
  clearImages()
})

app.on('window-all-closed', () => app.quit())
