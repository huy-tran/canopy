// Receives Claude Code hook events. Each session runs with `--settings <file>` whose hooks
// pipe the hook's stdin JSON to this local server with curl (ships with Windows 10+).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type HookHandler = (sid: string, event: string, payload: Record<string, any>) => void

let port = 0
let server: http.Server | null = null

export function startHookServer(onEvent: HookHandler): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const m = (req.url || '').match(/^\/h\/([\w-]+)$/)
      if (req.method !== 'POST' || !m) {
        res.writeHead(404).end()
        return
      }
      const chunks: Buffer[] = []
      req.on('data', c => chunks.push(c))
      req.on('end', () => {
        // Empty 204: hook stdout is shown to Claude for some events, so say nothing.
        res.writeHead(204).end()
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
          onEvent(m[1]!, String(payload.hook_event_name || ''), payload)
        } catch {
          // Ignore malformed hook bodies.
        }
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as { port: number }).port
      resolve(port)
    })
  })
}

export function stopHookServer() {
  server?.close()
  server = null
}

function hooksDir() {
  const d = path.join(app.getPath('userData'), 'hooks')
  fs.mkdirSync(d, { recursive: true })
  return d
}

/** Writes the per-session settings file and returns its path. */
export function writeSessionSettings(sid: string): string {
  const cmd = `curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- http://127.0.0.1:${port}/h/${sid}`
  const hook = [{ hooks: [{ type: 'command', command: cmd }] }]
  const settings = {
    hooks: {
      SessionStart: hook,
      UserPromptSubmit: hook,
      Notification: hook,
      Stop: hook,
      PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash', hooks: hook[0]!.hooks }],
      PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit', hooks: hook[0]!.hooks }],
    },
  }
  const file = path.join(hooksDir(), `${sid}.json`)
  fs.writeFileSync(file, JSON.stringify(settings, null, 2))
  return file
}

export function removeSessionSettings(sid: string) {
  try {
    fs.unlinkSync(path.join(hooksDir(), `${sid}.json`))
  } catch {
    // Already gone.
  }
}

export function clearSessionSettings() {
  try {
    for (const f of fs.readdirSync(hooksDir())) fs.unlinkSync(path.join(hooksDir(), f))
  } catch {
    // Nothing to clear.
  }
}
