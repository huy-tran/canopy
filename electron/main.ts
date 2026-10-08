import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Store from 'electron-store'
import electronUpdater from 'electron-updater'
import type { HookEvent, Persisted, UpdateState } from '../shared/types'
import { clearSessionSettings, startHookServer, stopHookServer } from './services/hooks'
import { bufferOf, killAllSessions, killSession, resizeSession, spawnSession, spawnShell, spawnTool, writeSession } from './services/pty'
import { dayActivity, lastAssistantText, projectHistory, unwatchTranscript, watchTranscript } from './services/transcript'
import { runClaude } from './services/claude'
import { findTool, reviewRequests } from './services/github'
import * as git from './services/git'
import { startService, stopAllServices, stopService } from './services/devservers'
import { planUsage } from './services/usage'
import { appInfo, clearImages, copyImage, listFonts, listShells, openInEditor, saveImage, showInFolder } from './services/system'

const { autoUpdater } = electronUpdater
const DEV_URL = process.env.CANOPY_DEV_URL
// Dev only: a separate profile folder runs a second instance alongside the main one (used for UI testing).
if (DEV_URL && process.env.CANOPY_USER_DATA) app.setPath('userData', process.env.CANOPY_USER_DATA)

const store = new Store<{ state?: Persisted; bounds?: Electron.Rectangle; maximized?: boolean }>({ name: 'canopy' })

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
/** Notifications still on screen; kept referenced so their button events arrive. */
const live = new Set<Notification>()

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

if (!app.requestSingleInstanceLock()) app.quit()

app.on('second-instance', () => showWindow())

function send(channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function showWindow() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Brand icon PNGs from public/brand (packaged under .output/public). */
function logoImage(size: 16 | 24 | 32 | 48 | 64 | 128 | 256 | 512 = 32) {
  const dir = app.isPackaged ? path.join(__dirname, '..', '.output', 'public', 'brand') : path.join(__dirname, '..', 'public', 'brand')
  return nativeImage.createFromPath(path.join(dir, `canopy-${size}.png`))
}

function prefs() {
  return store.get('state')?.prefs
}

function applyLoginItem() {
  const p = prefs()
  if (!p || !app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: !!p.launchLogin })
}

function ensureTray() {
  const want = !!prefs()?.tray
  if (want && !tray) {
    tray = new Tray(logoImage(16))
    tray.setToolTip('Canopy')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Canopy', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit() } },
    ]))
    tray.on('click', () => showWindow())
  } else if (!want && tray) {
    tray.destroy()
    tray = null
  }
}

// ---------- Global summon shortcut ----------

const ACCEL_KEYS: Record<string, string> = { '→': 'Right', '←': 'Left', '↑': 'Up', '↓': 'Down', 'Esc': 'Escape' }
let summonCombo = ''
let summonOk = true

/** Brings the window to the front, or tucks it away when it already has focus. */
function toggleWindow() {
  if (!win) return
  if (win.isVisible() && !win.isMinimized() && win.isFocused()) {
    if (prefs()?.tray) win.hide()
    else win.minimize()
  } else showWindow()
}

/** "Ctrl+Alt+→" -> Electron accelerator "Ctrl+Alt+Right". */
function toAccelerator(combo: string) {
  return combo.split('+').map(k => ACCEL_KEYS[k] || k).join('+')
}

/** Registers the summon shortcut; false when another app already holds it. */
function applySummonKey(combo: string) {
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

function createWindow() {
  const bounds = store.get('bounds')
  win = new BrowserWindow({
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    backgroundColor: '#0F1012',
    icon: logoImage(256),
    title: 'Canopy',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  if (store.get('maximized')) win.maximize()
  win.once('ready-to-show', () => win?.show())
  // The design's type is dense at 100%; render the whole UI a step larger.
  win.webContents.on('did-finish-load', () => win?.webContents.setZoomFactor(1.1))
  const saveBounds = () => {
    if (!win || win.isDestroyed()) return
    store.set('maximized', win.isMaximized())
    if (!win.isMaximized() && !win.isMinimized()) store.set('bounds', win.getBounds())
  }
  win.on('resize', saveBounds)
  win.on('move', saveBounds)
  win.on('maximize', () => send('win:maximized', true))
  win.on('unmaximize', () => send('win:maximized', false))
  win.on('close', (e) => {
    if (!quitting && prefs()?.tray) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadURL('app://canopy/index.html')
}

// ---------- Hooks: session status from Claude Code ----------

function onHook(sid: string, event: string, payload: Record<string, any>) {
  const ev: HookEvent = { sid, event, payload }
  if (payload.transcript_path) watchTranscript(sid, String(payload.session_id || ''), String(payload.transcript_path), u => send('session:usage', u))
  if (event === 'Stop') ev.lastText = lastAssistantText(sid)
  send('session:hook', ev)
}

// ---------- Updates ----------

let upd: UpdateState | null = null

function setUpd(s: UpdateState) {
  upd = s
  send('upd:status', s)
}

function wireUpdater() {
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
  autoUpdater.on('error', e => setUpd({ status: 'error', error: String(e?.message || e) }))
}

async function checkUpdates() {
  setUpd({ status: 'checking' })
  if (!app.isPackaged) {
    setTimeout(() => setUpd({ status: 'current' }), 900)
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e: any) {
    setUpd({ status: 'error', error: String(e?.message || e) })
  }
}

// ---------- IPC ----------

function handle(channel: string, fn: (...args: any[]) => any) {
  ipcMain.handle(channel, (_e, ...args) => fn(...args))
}

function registerIpc() {
  handle('state:load', () => store.get('state') ?? null)
  handle('state:save', (s: Persisted) => {
    store.set('state', s)
    ensureTray()
    applyLoginItem()
    applySummonKey(s.prefs?.summonKey ?? '')
  })

  handle('pty:spawn', o => spawnSession(o, (id, d) => send('pty:data', id, d), (id, code) => {
    unwatchTranscript(id)
    send('pty:exit', id, code)
  }))
  ipcMain.on('pty:write', (_e, id: string, d: string) => writeSession(id, d))
  ipcMain.on('pty:resize', (_e, id: string, c: number, r: number) => resizeSession(id, c, r))
  handle('pty:shell', async (o: { id: string; cwd: string; kind: string; cols: number; rows: number }) => {
    const shells = await listShells()
    const shell = shells.find(s => s.kind === o.kind) || shells[0]!
    return spawnShell({ ...o, shell }, (id, d) => send('pty:data', id, d), (id, code) => send('pty:exit', id, code))
  })
  handle('pty:tool', (o: { id: string; cmd: string; dark: boolean; cols: number; rows: number }) => {
    // gh-tui's theme follows the terminal colours, unless one is set in the environment.
    const env: Record<string, string> = process.env.GITHUB_TUI_THEME ? {} : { GITHUB_TUI_THEME: o.dark ? 'dark' : 'light' }
    return spawnTool({ ...o, cwd: app.getPath('home'), env }, (id, d) => send('pty:data', id, d), (id, code) => send('pty:exit', id, code))
  })
  handle('pty:kill', (id: string) => {
    unwatchTranscript(id)
    killSession(id)
  })
  handle('pty:buffer', (id: string) => bufferOf(id))

  handle('git:info', (p: string) => git.repoInfo(p))
  handle('git:status', (p: string) => git.status(p))
  handle('git:files', (p: string) => git.files(p))
  handle('git:diff', (p: string, f: string) => git.diff(p, f))
  handle('git:read', (p: string, f: string) => git.readFile(p, f))
  handle('git:worktreeAdd', (repo: string, base: string, slug: string) => git.worktreeAdd(repo, base, slug))
  handle('git:merge', async (repo: string, wt: string, branch: string, base: string) => {
    try {
      await git.mergeWorktree(repo, wt, branch, base)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  })

  handle('svc:start', o => startService(o, {
    data: (id, d) => send('svc:data', id, d),
    status: (id, s, code) => send('svc:status', id, s, code),
  }))
  handle('svc:stop', (id: string) => stopService(id))

  handle('git:stage', (cwd: string, paths: string[]) => git.stage(cwd, paths))
  handle('git:unstage', (cwd: string, paths: string[]) => git.unstage(cwd, paths))
  handle('git:commit', (cwd: string, message: string, all: boolean) => git.commit(cwd, message, all))
  handle('git:sync', (cwd: string) => git.syncInfo(cwd))
  handle('git:push', (cwd: string) => git.push(cwd))
  handle('git:prUrl', (cwd: string) => git.pullRequestUrl(cwd))
  handle('git:draftMessage', async (cwd: string) => {
    const diff = await git.diffForMessage(cwd)
    if (!diff.trim()) return { ok: false, text: '', error: 'There are no changes to describe.' }
    return runClaude([
      'Write a git commit message for the changes below.',
      'Format: a subject line under 72 characters in the imperative mood, then optionally a blank line and at most three short lines of body.',
      'Say what changed, not why or how. No bullet lists, no file-by-file breakdown, no trailers, no co-author lines, no quotes or code fences.',
      'Never use em dashes or en dashes; use a plain hyphen. Reply with the message only.',
      '',
      diff,
    ].join('\n'))
  })

  handle('history', (repos: { id: string; path: string }[]) => projectHistory(repos))
  handle('summary:activity', async (repos: { id: string; path: string }[], since: number, until: number) => {
    const commits = (await Promise.all(repos.filter(r => r.path).map(async r => (await git.commitsBetween(r.path, since, until)).map(c => ({ ...c, repoId: r.id })))))
      .flat().sort((a, b) => a.at - b.at)
    return { sessions: dayActivity(repos, since, until), commits }
  })
  handle('claude:run', (prompt: string) => runClaude(prompt))
  handle('usage', () => planUsage())
  handle('gh:reviews', () => reviewRequests())
  handle('gh:findTool', (custom: string) => findTool(custom))

  handle('sys:openExternal', (url: string) => shell.openExternal(url))
  handle('sys:showInFolder', (p: string) => showInFolder(p))
  handle('sys:openEditor', (editor: string, folder: string, file?: string) => openInEditor(editor, folder, file))
  handle('sys:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('sys:fonts', () => listFonts())
  handle('sys:shells', () => listShells())
  handle('sys:info', () => appInfo())
  handle('sys:saveImage', (sid: string, name: string, bytes: Uint8Array) => saveImage(sid, name, bytes))
  handle('sys:copyImage', (file: string) => copyImage(file))
  handle('sys:saveImageAs', async (file: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('pictures'), path.basename(file)) })
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

  handle('win:minimize', () => win?.minimize())
  handle('win:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  handle('win:close', () => win?.close())
  handle('win:isMaximized', () => !!win?.isMaximized())
  handle('win:summonKey', (combo: string) => applySummonKey(combo))
  handle('app:quit', () => {
    quitting = true
    app.quit()
  })

  handle('upd:check', () => checkUpdates())
  handle('upd:download', () => autoUpdater.downloadUpdate().catch(e => setUpd({ status: 'error', error: String(e?.message || e) })))
  handle('upd:install', () => {
    quitting = true
    autoUpdater.quitAndInstall()
  })
  handle('upd:state', () => upd)
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.canopy.app')
  Menu.setApplicationMenu(null)
  const root = path.join(__dirname, '..', '.output', 'public')
  protocol.handle('app', (req) => {
    const u = new URL(req.url)
    let p = path.join(root, decodeURIComponent(u.pathname))
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(root, 'index.html')
    return net.fetch(pathToFileURL(p).toString())
  })
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
  quitting = true
  globalShortcut.unregisterAll()
  killAllSessions()
  stopAllServices()
  stopHookServer()
  clearImages()
})

app.on('window-all-closed', () => app.quit())
