// The app:// scheme the packaged app loads from, its Content-Security-Policy and the permissions it grants.
import { net, protocol, session } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isAppUrl } from './context'
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
