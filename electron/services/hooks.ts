// Receives Claude Code hook events. Each session runs with `--settings <file>` whose hooks
// pipe the hook's stdin JSON to this local server with curl (ships with Windows 10+).
// The same server answers the worker tools (MCP over HTTP) a session is given with `--mcp-config <file>`.
import crypto from 'node:crypto'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { AGENT_SERVER, handleMcp, type AgentReply } from '../../shared/agenttools'

export type HookHandler = (sid: string, event: string, payload: Record<string, any>) => void
/** Carries out a tool a session called. */
export type ToolHandler = (sid: string, tool: string, args: Record<string, unknown>) => Promise<AgentReply>

let port = 0
/** Part of every hook URL, so a web page or another local program can't post made-up session events. */
const token = crypto.randomBytes(16).toString('hex')
/** Hook payloads are small; anything bigger is not from Claude Code. */
const MAX_BODY = 8 * 1024 * 1024
let server: http.Server | null = null

export function startHookServer(onEvent: HookHandler, onTool?: ToolHandler): Promise<number> {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const m = (req.url || '').match(/^\/(h|mcp)\/([\w-]+)\/([\w-]+)$/)
      if (!m || m[2] !== token || req.headers.origin) {
        res.writeHead(404).end()
        return
      }
      const mcp = m[1] === 'mcp'
      if (req.method !== 'POST' || (mcp && !onTool)) {
        // The tools answer each call in its own response: there is no stream to open or session to end.
        res.writeHead(mcp ? 405 : 404, mcp ? { Allow: 'POST' } : undefined).end()
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) {
          res.writeHead(413).end()
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (mcp) {
          answerMcp(m[3]!, body, res, onTool!)
          return
        }
        // Empty 204: hook stdout is shown to Claude for some events, so say nothing.
        res.writeHead(204).end()
        try {
          const payload = JSON.parse(body || '{}')
          onEvent(m[3]!, String(payload.hook_event_name || ''), payload)
        } catch {
          // Ignore malformed hook bodies.
        }
      })
    })
    // A session may wait minutes on a worker in one call.
    server.requestTimeout = 0
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      port = (server!.address() as { port: number }).port
      resolve(port)
    })
  })
}

async function answerMcp(sid: string, body: string, res: http.ServerResponse, onTool: ToolHandler) {
  let msg: any
  try {
    msg = JSON.parse(body)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }))
    return
  }
  const one = (m: any) => handleMcp(m, (tool, args) => onTool(sid, tool, args), app.getVersion())
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(one))).filter(Boolean) : await one(msg)
  if (res.destroyed) return
  // Notifications are only acknowledged.
  if (!out || (Array.isArray(out) && !out.length)) res.writeHead(202).end()
  else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out))
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
  if (!/^[\w-]+$/.test(sid)) throw new Error('Not a session id.')
  const cmd = `curl -s -m 3 -X POST -H "Content-Type: application/json" --data-binary @- http://127.0.0.1:${port}/h/${token}/${sid}`
  const hook = [{ hooks: [{ type: 'command', command: cmd }] }]
  const settings = {
    hooks: {
      SessionStart: hook,
      UserPromptSubmit: hook,
      Notification: hook,
      Stop: hook,
      SubagentStop: hook,
      // Task and Agent start subagents, which the workspace simulation shows.
      PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash|Task|Agent', hooks: hook[0]!.hooks }],
      PostToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit|Task|Agent', hooks: hook[0]!.hooks }],
    },
  }
  const file = path.join(hooksDir(), `${sid}.json`)
  fs.writeFileSync(file, JSON.stringify(settings, null, 2))
  return file
}

/** Writes the file that gives a session the worker tools (for `--mcp-config`) and returns its path. */
export function writeSessionTools(sid: string): string {
  if (!/^[\w-]+$/.test(sid)) throw new Error('Not a session id.')
  const file = path.join(hooksDir(), `${sid}.mcp.json`)
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { [AGENT_SERVER]: { type: 'http', url: `http://127.0.0.1:${port}/mcp/${token}/${sid}` } } }, null, 2))
  return file
}

export function removeSessionSettings(sid: string) {
  for (const f of [`${sid}.json`, `${sid}.mcp.json`]) {
    try {
      fs.unlinkSync(path.join(hooksDir(), f))
    } catch {
      // Already gone.
    }
  }
}

export function clearSessionSettings() {
  try {
    for (const f of fs.readdirSync(hooksDir())) fs.unlinkSync(path.join(hooksDir(), f))
  } catch {
    // Nothing to clear.
  }
}
