import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, shell, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import Store from 'electron-store'
import electronUpdater from 'electron-updater'
import type { GhWorld, HookEvent, Persisted, UpdateState } from '../shared/types'
import type { AwsCtx, AwsWorld } from '../shared/aws'
import { AWS_CALLS, type AwsApi } from '../shared/bridge'
import { clearSessionSettings, startHookServer, stopHookServer } from './services/hooks'
import { bufferOf, killAllSessions, killSession, resizeSession, spawnCommand, spawnSession, spawnShell, writeSession } from './services/pty'
import { dayActivity, lastAssistantText, projectHistory, unwatchTranscript, watchTranscript } from './services/transcript'
import { runClaude } from './services/claude'
import {
  allRepos, branches, cancelRun, dispatchables, rateLimit, runWorkflow, githubWorld, mergePull, pullDetail, pullDiff, rerunRun, reviewPull, reviewRequests, runDetail, runLog, searchPulls, securityAlerts, workflowRuns,
} from './services/github'
import * as aws from './services/aws'
import * as git from './services/git'
import { startService, stopAllServices, stopService } from './services/devservers'
import { planUsage } from './services/usage'
import { countIpc, countPty, sampleMetrics } from './services/metrics'
import { appInfo, clearImages, copyImage, listFonts, listShells, openInEditor, saveImage, showInFolder } from './services/system'

const { autoUpdater } = electronUpdater
const DEV_URL = process.env.CANOPY_DEV_URL
/** Dev only (npm run dev:demo): made-up projects and sessions, in a profile of its own. */
const DEMO = !!DEV_URL && !!process.env.CANOPY_DEMO
// Dev only: a separate profile folder runs a second instance alongside the main one (used for UI testing).
if (DEV_URL && process.env.CANOPY_USER_DATA) app.setPath('userData', process.env.CANOPY_USER_DATA)
else if (DEMO) app.setPath('userData', path.join(app.getPath('appData'), 'canopy-demo'))

const store = new Store<{ state?: Persisted; bounds?: Electron.Rectangle; maximized?: boolean }>({ name: 'canopy' })
/** GitHub HQ's last good read, so the 3D World and the GitHub window fill in at once on the next launch. */
const ghCache = new Store<{ world?: GhWorld }>({ name: 'github-cache' })
/** The data centre's last good read, likewise for the 3D World and the AWS window. */
const awsCache = new Store<{ world?: AwsWorld }>({ name: 'aws-cache' })

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
/** Notifications still on screen; kept referenced so their button events arrive. */
const live = new Set<Notification>()

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

if (!app.requestSingleInstanceLock()) app.quit()

app.on('second-instance', () => showWindow())

function send(channel: string, ...args: unknown[]) {
  if (!win || win.isDestroyed()) return
  countIpc()
  win.webContents.send(channel, ...args)
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

let loginItem: boolean | undefined

function applyLoginItem() {
  const p = prefs()
  if (!p || !app.isPackaged || loginItem === !!p.launchLogin) return
  loginItem = !!p.launchLogin
  app.setLoginItemSettings({ openAtLogin: loginItem })
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
  // Dragging fires many events a second, and each store write is a synchronous file write.
  let boundsT: ReturnType<typeof setTimeout> | undefined
  const writeBounds = () => {
    clearTimeout(boundsT)
    if (!win || win.isDestroyed()) return
    store.set('maximized', win.isMaximized())
    if (!win.isMaximized() && !win.isMinimized()) store.set('bounds', win.getBounds())
  }
  const saveBounds = () => {
    clearTimeout(boundsT)
    boundsT = setTimeout(writeBounds, 500)
  }
  win.on('close', writeBounds)
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
  if (DEV_URL) win.loadURL(DEMO ? `${DEV_URL}/?demo=1` : DEV_URL)
  else win.loadURL('app://canopy/index.html')
}

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

function ptyData(id: string, d: string) {
  countPty(d.length)
  send('pty:data', id, d)
}

/** The GitHub HQ data last written to the cache, to skip rewriting it unchanged. */
let ghCacheKey = ''

// ---------- AWS ----------

aws.configureAws(() => {
  const p = prefs()
  return { totp: p?.awsTotp !== false, ttlHours: p?.awsUnlockHours || 4, dryRun: !!p?.awsDryRun }
})

/** One `aws:<name>` channel per call in AWS_CALLS. */
function registerAws() {
  const calls: { [K in (typeof AWS_CALLS)[number]]: (...a: any[]) => ReturnType<AwsApi[K]> | Awaited<ReturnType<AwsApi[K]>> } = {
    lockState: () => aws.lockState(),
    unlock: (code: string) => aws.unlock(code, aws.settings().ttlHours),
    lock: () => aws.lock(),
    enrolStart: () => aws.enrolStart(),
    enrolFinish: (code: string) => aws.enrolFinish(code, aws.settings().ttlHours),
    profiles: () => aws.listProfiles(),
    state: () => aws.loadState(),
    remember: (profile: string, region: string) => aws.rememberProfile(profile, region),
    saveBookmarks: (profile, list) => aws.saveBookmarks(profile, list),
    forget: (profile: string) => aws.forgetProfile(profile),
    regions: (ctx: AwsCtx) => aws.regions(ctx),
    world: async (ctx: AwsCtx, force: boolean) => {
      const w = await aws.world(ctx, force)
      if (!w.error) awsCache.set('world', w)
      return w
    },
    cachedWorld: () => awsCache.get('world') ?? null,
    search: (ctx: AwsCtx) => aws.search(ctx),
    term: (ctx: AwsCtx, id: string, o: any, cols: number, rows: number) => {
      if (!aws.gateOpen()) return { ok: false, error: 'AWS is locked.' }
      const c = aws.cliCommand(ctx, o)
      if ('error' in c) return { ok: false, error: c.error }
      spawnCommand({ id, cmd: c.cmd, cols, rows }, ptyData, (i, code) => send('pty:exit', i, code))
      return { ok: true, cmd: c.cmd }
    },
    ec2Instances: (ctx, force) => aws.ec2Instances(ctx, force),
    ec2Console: (ctx, id, latest) => aws.ec2Console(ctx, id, latest),
    ec2Power: (ctx, id, what, name, before) => aws.ec2Power(ctx, id, what, name, before),
    ebEnvs: (ctx, force) => aws.ebEnvs(ctx, force),
    ebEvents: (ctx, env) => aws.ebEvents(ctx, env),
    ebVersions: (ctx, app, force) => aws.ebVersions(ctx, app, force),
    ebDeploy: (ctx, env, version) => aws.ebDeploy(ctx, env, version),
    rdsInstances: (ctx, force) => aws.rdsInstances(ctx, force),
    ecResources: (ctx, force) => aws.ecResources(ctx, force),
    ecUpdates: (ctx, force) => aws.ecUpdates(ctx, force),
    ecServiceUpdate: (ctx, name, force) => aws.ecServiceUpdate(ctx, name, force),
    ecApply: (ctx, update, resource, kind, severity) => aws.ecApply(ctx, update, resource, kind, severity),
    logGroups: (ctx, token, force) => aws.logGroups(ctx, token, force),
    logStreams: (ctx, group, force) => aws.logStreams(ctx, group, force),
    logEvents: (ctx, group, stream) => aws.logEvents(ctx, group, stream),
    logSearch: (ctx, group, pattern, start, end) => aws.logSearch(ctx, group, pattern, start, end),
    tailStart: (ctx, id, arn) => aws.tailStart(ctx, id, arn, m => send('aws:tail', m)),
    tailStop: (id: string) => aws.tailStop(id),
    cfDistributions: (ctx, force) => aws.cfDistributions(ctx, force),
    cfInvalidations: (ctx, dist, force) => aws.cfInvalidations(ctx, dist, force),
    cfInvalidate: (ctx, dist, paths) => aws.cfInvalidate(ctx, dist, paths),
    s3Buckets: (ctx, force) => aws.s3Buckets(ctx, force),
    s3List: (ctx, bucket, region, prefix, force) => aws.s3List(ctx, bucket, region, prefix, force),
    s3Download: async (ctx: AwsCtx, bucket: string, region: string, key: string) => {
      const r = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('downloads'), path.basename(key)) })
      if (r.canceled || !r.filePath) return { ok: true as const, data: null }
      return aws.s3Download(ctx, bucket, region, key, r.filePath)
    },
    s3Delete: (ctx, bucket, region, keys) => aws.s3Delete(ctx, bucket, region, keys),
    s3PickUpload: async () => {
      const r = await dialog.showOpenDialog(win!, { properties: ['openFile', 'multiSelections'] })
      if (r.canceled) return []
      const sizes = aws.fileSizes(r.filePaths)
      return r.filePaths.map((p, i) => ({ path: p, size: sizes[i] || 0 }))
    },
    s3Existing: (ctx, bucket, region, keys) => aws.s3Existing(ctx, bucket, region, keys),
    s3Upload: (ctx, bucket, region, file, key) => aws.s3Upload(ctx, bucket, region, file, key),
    params: (ctx, force) => aws.params(ctx, force),
    paramValue: (ctx, meta, version) => aws.paramValue(ctx, meta, version),
    paramHistory: (ctx, name) => aws.paramHistory(ctx, name),
    paramPut: (ctx, o) => aws.paramPut(ctx, o),
    shInsights: (ctx, force) => aws.shInsights(ctx, force),
    shInsightResults: (ctx, arn) => aws.shInsightResults(ctx, arn),
    shFindings: (ctx, q) => aws.shFindings(ctx, q),
    cdApps: (ctx, force) => aws.cdApps(ctx, force),
    cdGroups: (ctx, appName, force) => aws.cdGroups(ctx, appName, force),
    cdDeployments: (ctx, appName, group, force) => aws.cdDeployments(ctx, appName, group, force),
  }
  for (const name of AWS_CALLS) handle(`aws:${name}`, calls[name])
}

function registerIpc() {
  handle('state:load', () => store.get('state') ?? null)
  handle('state:save', (s: Persisted) => {
    store.set('state', s)
    ensureTray()
    applyLoginItem()
    applySummonKey(s.prefs?.summonKey ?? '')
  })

  handle('pty:spawn', o => spawnSession(o, ptyData, (id, code) => {
    unwatchTranscript(id)
    send('pty:exit', id, code)
  }))
  ipcMain.on('pty:write', (_e, id: string, d: string) => writeSession(id, d))
  ipcMain.on('pty:resize', (_e, id: string, c: number, r: number) => resizeSession(id, c, r))
  handle('pty:shell', async (o: { id: string; cwd: string; kind: string; cols: number; rows: number }) => {
    const shells = await listShells()
    const shell = shells.find(s => s.kind === o.kind) || shells[0]!
    return spawnShell({ ...o, shell }, ptyData, (id, code) => send('pty:exit', id, code))
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
    return { sessions: await dayActivity(repos, since, until), commits }
  })
  handle('claude:run', (prompt: string) => runClaude(prompt))
  handle('usage', () => planUsage())
  handle('gh:reviews', () => reviewRequests())
  handle('gh:world', async (folders: string[], hidden: string[]) => {
    const w = await githubWorld(folders, hidden || [])
    if (!w.error) {
      // Only the data counts as a change, not the time it was read.
      const key = JSON.stringify({ ...w, at: 0 })
      if (key !== ghCacheKey) {
        ghCacheKey = key
        setImmediate(() => ghCache.set('world', w))
      }
    }
    return w
  })
  handle('gh:cachedWorld', () => ghCache.get('world') ?? null)
  handle('gh:runs', (repos: string[]) => workflowRuns(repos))
  handle('gh:rateLimit', () => rateLimit())
  handle('gh:search', (filter: string) => searchPulls(filter))
  handle('gh:pull', (url: string) => pullDetail(url))
  handle('gh:pullDiff', (url: string) => pullDiff(url))
  handle('gh:review', (url: string, kind: 'approve' | 'request-changes' | 'comment', body: string) => reviewPull(url, kind, body))
  handle('gh:merge', (url: string, method: 'merge' | 'squash' | 'rebase', deleteBranch: boolean) => mergePull(url, method, deleteBranch))
  handle('gh:run', (repo: string, id: number) => runDetail(repo, id))
  handle('gh:runLog', (repo: string, id: number, job?: number) => runLog(repo, id, job))
  handle('gh:rerun', (repo: string, id: number, failedOnly: boolean) => rerunRun(repo, id, failedOnly))
  handle('gh:cancel', (repo: string, id: number) => cancelRun(repo, id))
  handle('gh:alerts', (repos: string[]) => securityAlerts(repos))
  handle('gh:repos', () => allRepos())
  handle('gh:dispatchables', (repo: string) => dispatchables(repo))
  handle('gh:branches', (repo: string) => branches(repo))
  handle('gh:runWorkflow', (repo: string, id: number, ref: string, inputs: Record<string, string>) => runWorkflow(repo, id, ref, inputs))

  registerAws()

  // Web links only: a link from outside (an AWS finding's remediation, say) never reaches another protocol handler.
  handle('sys:openExternal', (url: string) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'https:' || u.protocol === 'http:') return shell.openExternal(u.href)
    } catch {
      // Not a URL.
    }
  })
  handle('sys:showInFolder', (p: string) => showInFolder(p))
  handle('sys:openEditor', (editor: string, folder: string, file?: string) => openInEditor(editor, folder, file))
  handle('sys:pickFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('sys:fonts', () => listFonts())
  handle('sys:shells', () => listShells())
  handle('sys:info', () => appInfo())
  handle('sys:metrics', () => sampleMetrics())
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
  aws.stopAllTails()
  stopAllServices()
  stopHookServer()
  clearImages()
})

app.on('window-all-closed', () => app.quit())
