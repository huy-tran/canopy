// The app window and its navigation rules.
import { BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { DEMO, DEV_URL, isAppUrl, logoImage, prefs, send, state, store } from './context'
import { webUrl } from './services/guard'
import { destroyTools } from './tools'

/** Links open in the browser, as http(s) only; a window never leaves the app. */
export function lockDown(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    const link = webUrl(url)
    if (link) shell.openExternal(link)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) {
      e.preventDefault()
      const link = webUrl(url)
      if (link) shell.openExternal(link)
    }
  })
  // Only the main window may host the preview, and only with the fixed preview session and a web address.
  win.webContents.on('will-attach-webview', (e, webPreferences, params) => {
    if (win !== state.win || params.partition !== PREVIEW_PARTITION || !webUrl(params.src)) return e.preventDefault()
    delete webPreferences.preload
    delete (webPreferences as { preloadURL?: string }).preloadURL
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false
    delete params.allowpopups
  })
}

/** Name of the session the preview pane's page runs in: apart from the app's own, and kept between launches (logins in the dev site). */
export const PREVIEW_PARTITION = 'persist:canopy-preview'

/** A dev site's own pages: localhost and the .test and .localhost names Herd and Valet serve, whose certificates are their own. */
export function isDevHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.test') || host.endsWith('.localhost')
}

/** The page inside a preview pane stays a web page: links go to the browser, nothing but http(s) loads. */
export function lockDownPreview(contents: Electron.WebContents) {
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler(({ url }) => {
    const link = webUrl(url)
    if (link) shell.openExternal(link)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (e, url) => {
    if (!webUrl(url)) e.preventDefault()
  })
}

/** Web preferences every window loads with. */
export function appWebPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    // The preload only imports electron and ../shared, which a sandboxed preload can do too; keep this on.
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
  }
}

export function createWindow() {
  const bounds = store.get('bounds')
  const win = new BrowserWindow({
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
    webPreferences: { ...appWebPreferences(), webviewTag: true },
  })
  state.win = win
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
    if (!state.quitting && prefs()?.tray) {
      e.preventDefault()
      win?.hide()
    }
  })
  // The tool windows have nothing to show once the main window is really gone.
  win.on('closed', destroyTools)
  lockDown(win)
  if (DEV_URL) win.loadURL(DEMO ? `${DEV_URL}/?demo=1` : DEV_URL)
  else win.loadURL('app://canopy/index.html')
}
