// The app:// scheme the packaged app loads from, its Content-Security-Policy and the permissions it grants.
import { app, net, protocol, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isAppUrl, send } from './context'
import { isDevHost, lockDownPreview, PREVIEW_PARTITION } from './window'
import { isInside } from './services/guard'

/** What the app's page may load. Nothing from outside except the weather lookup; no plugins, frames or form posts. */
const CSP = [
  "default-src 'self'",
  // Nuxt writes its start-up data into an inline script; Shiki compiles WebAssembly.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://geocoding-api.open-meteo.com https://api.open-meteo.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

/** Call once the app is ready. */
export function serveApp() {
  // Copy buttons use the clipboard; nothing else (camera, microphone, location...) is ever granted.
  const allowed = (permission: string, origin: string) => (permission === 'clipboard-sanitized-write' || permission === 'clipboard-read') && isAppUrl(origin)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => cb(allowed(permission, details.requestingUrl)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => allowed(permission, origin))
  // The preview pane's page is the user's own dev site: no permission prompts (camera, location...), and its local https certificates are trusted.
  const preview = session.fromPartition(PREVIEW_PARTITION)
  preview.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
  preview.setPermissionCheckHandler(() => false)
  preview.setCertificateVerifyProc((req, cb) => cb(isDevHost(req.hostname) ? 0 : -3))
  // Failed requests of the page (a 500 from the server, a call that errored) go to the pane's Diagnose bar.
  const report = (d: { webContentsId?: number; url: string; method: string; resourceType: string }, status: number, error?: string) =>
    send('preview:request', { wc: d.webContentsId, url: d.url, method: d.method, type: d.resourceType, status, error })
  preview.webRequest.onCompleted((d) => {
    const call = d.resourceType === 'xhr' || d.resourceType === 'mainFrame'
    if (d.statusCode >= 500 || (d.statusCode >= 400 && call && d.statusCode !== 404)) report(d, d.statusCode)
  })
  preview.webRequest.onErrorOccurred((d) => {
    if ((d.resourceType === 'xhr' || d.resourceType === 'mainFrame') && d.error !== 'net::ERR_ABORTED') report(d, 0, d.error)
  })
  app.on('web-contents-created', (_e, contents) => lockDownPreview(contents))
  const root = path.join(__dirname, '..', '.output', 'public')
  protocol.handle('app', async (req) => {
    const u = new URL(req.url)
    let p = path.join(root, decodeURIComponent(u.pathname))
    // Inside the app's folder only, and the front page for anything that isn't a file.
    if (!isInside(root, p)) return new Response('Not found', { status: 404 })
    const st = await fs.promises.stat(p).catch(() => null)
    if (!st || st.isDirectory()) p = path.join(root, 'index.html')
    const res = await net.fetch(pathToFileURL(p).toString())
    // Set here, on what the page is served with: responses from a custom protocol don't pass through webRequest.
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(res.body, { status: res.status, headers })
  })
}
