// The tools a Claude session gets from Canopy to start worker sessions and follow them, and the
// MCP (JSON-RPC over HTTP) messages that carry them. The main process serves them; the main window carries them out.

/** One tool call from a session, sent to the main window. */
export interface AgentCall {
  id: string
  /** The session that called. */
  sid: string
  tool: string
  args: Record<string, unknown>
}

export interface AgentReply {
  ok: boolean
  text: string
}

export const AGENT_SERVER = 'canopy'

/** Longest a session may wait on a worker in one call, in seconds. Claude Code gives up on a tool call that takes much over a minute. */
export const WAIT_MAX = 50

export const AGENT_TOOLS = [
  {
    name: 'list_sessions',
    description: 'Lists this Canopy project: its repos, and every Claude session open in it with its id, repo, status (working, waiting, done, idle), branch and title. Workers you started are marked.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'start_worker',
    description: 'Starts another Claude Code session in this project as a worker, in its own pane, and gives it a task. By default it works in a fresh git worktree on its own branch, so it cannot collide with your files. Returns the worker id at once; the worker runs on its own. Write the prompt as a complete brief: the worker knows nothing of this conversation. Use worker_result to wait for it and read what it reported.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The whole task for the worker, with every detail it needs.' },
        repo: { type: 'string', description: 'Label of the repo to work in, from list_sessions. Defaults to your own repo.' },
        worktree: { type: 'boolean', description: 'Work in a fresh git worktree (default true). False works in the repo folder itself, alongside its other sessions.' },
        name: { type: 'string', description: 'A short name for the worker, shown on its pane.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'worker_result',
    description: `Reads a worker: its status, what it said when its turn ended, the files it changed, and its branch and folder. With wait_seconds it waits until the worker finishes its turn or needs input, up to ${WAIT_MAX} seconds; call it again, as often as it takes, while the worker is still working.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The worker id from start_worker.' },
        wait_seconds: { type: 'number', description: `How long to wait for the worker to finish, 0 to ${WAIT_MAX}. Default 0: answer at once.` },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'message_worker',
    description: 'Sends a follow-up prompt to a worker you started, such as an answer to its question or a correction.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The worker id from start_worker.' },
        prompt: { type: 'string', description: 'What to tell the worker.' },
      },
      required: ['id', 'prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'close_worker',
    description: 'Closes a worker you started, ending its session. Its branch and worktree folder stay on disk.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The worker id from start_worker.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
] as const

export type AgentToolName = (typeof AGENT_TOOLS)[number]['name']

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05']

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }

const result = (id: Rpc['id'], r: unknown) => ({ jsonrpc: '2.0', id, result: r })
const error = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

/**
 * Answers one MCP message. Null for a notification, which gets no answer.
 * `call` runs a tool; a tool that fails still answers, with isError set, so Claude reads why.
 */
export async function handleMcp(msg: Rpc, call: (tool: string, args: Record<string, unknown>) => Promise<AgentReply>, version = '0'): Promise<object | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return error(msg?.id, -32600, 'Not a JSON-RPC 2.0 request.')
  // No id: a notification (initialized, cancelled), which is never answered.
  if (msg.id === undefined) return null
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion || '')
      return result(msg.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: AGENT_SERVER, version },
        instructions: 'Canopy is the desktop app this session runs in. These tools start other Claude Code sessions in the same project as workers and read what they report.',
      })
    }
    case 'ping':
      return result(msg.id, {})
    case 'tools/list':
      return result(msg.id, { tools: AGENT_TOOLS })
    case 'tools/call': {
      const name = String(msg.params?.name || '')
      if (!AGENT_TOOLS.some(t => t.name === name)) return error(msg.id, -32602, `Unknown tool: ${name}`)
      const args = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {}
      let r: AgentReply
      try {
        r = await call(name, args)
      } catch (e) {
        r = { ok: false, text: e instanceof Error ? e.message : String(e) }
      }
      return result(msg.id, { content: [{ type: 'text', text: r.text }], isError: !r.ok })
    }
    default:
      return error(msg.id, -32601, `Method not found: ${msg.method}`)
  }
}
