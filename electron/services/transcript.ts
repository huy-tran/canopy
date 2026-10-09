// Reads Claude Code session logs (~/.claude/projects/<encoded cwd>/<session>.jsonl)
// for tokens, model, context use, and the per-project history used by Overview.
import type fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { Act, DaySession, HistorySession, ToolResult, UsageUpdate } from '../../shared/types'
import { contextOf, costOf } from '../../shared/pricing'

export const claudeDir = () => path.join(os.homedir(), '.claude')
export const projectsDir = () => path.join(claudeDir(), 'projects')

/** Claude Code encodes a cwd by replacing every non-alphanumeric character with "-". */
export function encodeCwd(cwd: string) {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

interface Totals {
  model: string
  tokIn: number
  tokOut: number
  cacheR: number
  cacheW: number
  ctx: number
  lastText: string
  lastPrompt: string
  /** Claude's latest line of narration and latest tool call, for the workspace simulation. */
  said: string
  doing: string
  /** Which of the two came last. */
  latest: 'said' | 'doing' | ''
  /** The kind of the latest tool call, and how the latest command turned out. */
  act: Act | ''
  result: ToolResult | null
  /** Commands in flight, by tool call id: whether each runs tests. */
  runs: Map<string, boolean>
}

const TEST_CMD = /\b(test|tests|jest|vitest|mocha|pytest|phpunit|pest|rspec|playwright|cargo test|go test|dotnet test)\b/i

/** The kind of a tool call, for what the workspace simulation acts out. */
function actOf(name: string, i: any = {}): Act {
  switch (name) {
    case 'Read':
    case 'Grep':
    case 'Glob':
    case 'LS': return 'read'
    case 'Bash':
    case 'PowerShell': return TEST_CMD.test(String(i.command || '')) ? 'test' : 'run'
    case 'WebFetch':
    case 'WebSearch': return 'web'
    case 'TodoWrite': return 'plan'
    case 'Task':
    case 'Agent': return 'delegate'
    default: return 'write'
  }
}

const base = (p: unknown) => String(p || '').split(/[\\/]/).pop() || ''
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

/** The opening of what Claude wrote, without markdown: its first sentence, or more when that is very short. */
function firstLine(text: string) {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#>`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  const sentences = plain.match(/[^.!?:]+[.!?:]+(?=\s|$)|[^.!?:]+$/g) || [plain]
  let line = ''
  for (const s of sentences) {
    line = (line + ' ' + s.trim()).trim()
    if (line.length >= 40) break
  }
  return clip(line.replace(/:$/, '…'), 120)
}

/** A tool call in plain words: "Editing schema.ts", "Running npm test", "Searching for postcode". */
function describeTool(name: string, i: any = {}) {
  switch (name) {
    case 'Read': return `Reading ${base(i.file_path)}`
    case 'Edit':
    case 'MultiEdit': return `Editing ${base(i.file_path)}`
    case 'Write': return `Writing ${base(i.file_path)}`
    case 'NotebookEdit': return `Editing ${base(i.notebook_path)}`
    case 'Bash': return i.description ? clip(String(i.description), 70) : `Running ${clip(String(i.command || '').split('\n')[0]!, 50)}`
    case 'PowerShell': return i.description ? clip(String(i.description), 70) : 'Running a command'
    case 'Grep': return `Searching for "${clip(String(i.pattern || ''), 40)}"`
    case 'Glob': return `Looking for ${clip(String(i.pattern || ''), 40)}`
    case 'WebSearch': return `Searching the web for "${clip(String(i.query || ''), 40)}"`
    case 'WebFetch': {
      try {
        return `Reading ${new URL(String(i.url)).hostname}`
      } catch {
        return 'Reading a web page'
      }
    }
    case 'Task':
    case 'Agent': return `Sending a helper to ${clip(String(i.description || 'look into it').toLowerCase(), 50)}`
    case 'TodoWrite': return 'Updating the plan'
    default: {
      const mcp = name.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/)
      return `Using ${(mcp ? mcp[1]! : name).replace(/_/g, ' ')}`
    }
  }
}

// ---------- Reading appended lines ----------

interface Tail {
  file: string
  offset: number
  rest: string
  dec: StringDecoder
}

/** Read in pieces this big, so a long log never blocks the main process for long. */
const CHUNK = 2 * 1024 * 1024

const newTail = (file: string): Tail => ({ file, offset: 0, rest: '', dec: new StringDecoder('utf8') })

function resetTail(t: Tail) {
  t.offset = 0
  t.rest = ''
  t.dec = new StringDecoder('utf8')
}

/** Hands over the whole lines appended since the last read, a chunk at a time, letting other work run in between. */
async function readAppended(t: Tail, size: number, onLines: (lines: string[]) => void) {
  const fh = await fsp.open(t.file, 'r')
  try {
    const buf = Buffer.allocUnsafe(Math.min(CHUNK, size - t.offset))
    while (t.offset < size) {
      const { bytesRead } = await fh.read(buf, 0, Math.min(buf.length, size - t.offset), t.offset)
      if (!bytesRead) break
      t.offset += bytesRead
      const parts = (t.rest + t.dec.write(buf.subarray(0, bytesRead))).split('\n')
      t.rest = parts.pop() || ''
      onLines(parts)
    }
  } finally {
    await fh.close()
  }
}

/** Sums usage per message id (Claude Code writes one line per content block, all carrying the same usage). */
function accumulate(lines: string[], byId: Map<string, any>, t: Totals) {
  for (const line of lines) {
    if (!line.trim()) continue
    let e: any
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const pt = promptText(e)
    if (pt) t.lastPrompt = pt
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      // A command's output comes back as a tool result, marked as an error when it failed.
      for (const c of e.message.content) {
        if (c?.type !== 'tool_result' || !t.runs.has(c.tool_use_id)) continue
        t.result = { ok: !c.is_error, test: t.runs.get(c.tool_use_id)!, at: Date.parse(e.timestamp) || Date.now() }
        t.runs.delete(c.tool_use_id)
      }
    }
    if (e.type !== 'assistant' || !e.message) continue
    const m = e.message
    if (m.model && m.model !== '<synthetic>') t.model = m.model
    const u = m.usage
    if (u) {
      // Running sums: a repeated id replaces its earlier usage.
      const id = m.id || e.uuid
      const old = byId.get(id)
      if (old) addUsage(t, old, -1)
      byId.set(id, u)
      addUsage(t, u, 1)
      t.ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    }
    const text = Array.isArray(m.content) ? m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim() : ''
    if (text) t.lastText = text
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c.type === 'text' && c.text?.trim()) {
        t.said = firstLine(c.text)
        t.latest = 'said'
      } else if (c.type === 'tool_use' && c.name) {
        t.doing = describeTool(String(c.name), c.input)
        t.latest = 'doing'
        t.act = actOf(String(c.name), c.input)
        if (c.id && (t.act === 'run' || t.act === 'test')) t.runs.set(c.id, t.act === 'test')
      }
    }
  }
}

function addUsage(t: Totals, u: any, sign: 1 | -1) {
  t.tokIn += sign * (u.input_tokens || 0)
  t.tokOut += sign * (u.output_tokens || 0)
  t.cacheR += sign * (u.cache_read_input_tokens || 0)
  t.cacheW += sign * (u.cache_creation_input_tokens || 0)
}

interface Watch {
  tail: Tail
  byId: Map<string, any>
  totals: Totals
  timer: NodeJS.Timeout
  /** The read in progress, shared by anyone who asks meanwhile. */
  reading: Promise<boolean> | null
  /** How far into the file the last usage report went; a read for a Stop hook doesn't count as reported. */
  sent: number
}

const watches = new Map<string, Watch>()

function readNew(w: Watch): Promise<boolean> {
  w.reading ??= (async () => {
    let size: number
    try {
      size = (await fsp.stat(w.tail.file)).size
    } catch {
      return false
    }
    if (size < w.tail.offset) {
      resetTail(w.tail)
      w.byId.clear()
      Object.assign(w.totals, { tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0 })
    }
    if (size === w.tail.offset) return false
    await readAppended(w.tail, size, lines => accumulate(lines, w.byId, w.totals))
    return true
  })().catch(() => false).finally(() => { w.reading = null })
  return w.reading
}

/** Follows a transcript file and reports usage whenever it grows. */
export function watchTranscript(sid: string, claudeId: string, file: string, emit: (u: UsageUpdate) => void) {
  const old = watches.get(sid)
  if (old && old.tail.file === file) return
  if (old) clearInterval(old.timer)
  const w: Watch = {
    tail: newTail(file), byId: new Map(), reading: null, sent: 0,
    totals: { model: '', tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0, ctx: 0, lastText: '', lastPrompt: '', said: '', doing: '', latest: '', act: '', result: null, runs: new Map() },
    timer: setInterval(() => tick(), 1500),
  }
  const tick = async () => {
    await readNew(w)
    if (w.tail.offset === w.sent || watches.get(sid) !== w) return
    w.sent = w.tail.offset
    const { model, lastPrompt, said, doing, latest, act, result, tokIn, tokOut, cacheR, cacheW } = w.totals
    const win = contextOf(model)
    emit({ sid, claudeId, model, lastPrompt, said, doing, latest, act, result, tokIn, tokOut, cacheR, cacheW, ctx: win ? Math.min(100, (w.totals.ctx / win) * 100) : 0 })
  }
  watches.set(sid, w)
  tick()
}

export async function lastAssistantText(sid: string): Promise<string> {
  const w = watches.get(sid)
  if (!w) return ''
  await readNew(w)
  return w.totals.lastText
}

export function unwatchTranscript(sid: string) {
  const w = watches.get(sid)
  if (w) clearInterval(w.timer)
  watches.delete(sid)
}

// ---------- History for Overview ----------

function dayKey(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function promptText(e: any): string {
  if (e.type !== 'user' || e.isMeta || !e.message) return ''
  const c = e.message.content
  const s = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x: any) => x.type === 'text').map((x: any) => x.text).join(' ') : ''
  if (!s || /^\s*<(command-|local-command|bash-|user-memory|system-reminder)/.test(s)) return ''
  return s
    .replace(/<pasted_content[^>]*>[\s\S]*?(<\/pasted_content>|$)/g, '[Pasted text]')
    .replace(/<[a-z_-]+(\s[^>]*)?>|<\/[a-z_-]+>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface MsgCost { tokIn: number; tokOut: number; cacheR: number; cacheW: number; cost: number; day: string }

/** One log file's history, read incrementally: only what was appended since the last look is parsed. */
interface Hist {
  tail: Tail
  key: string
  byId: Map<string, MsgCost>
  title: string
  lastPrompt: string
  branch: string
  start: number
  end: number
  sums: { tokIn: number; tokOut: number; cacheR: number; cacheW: number; cost: number }
  days: Record<string, number>
  data: Omit<HistorySession, 'repoId'> | null
  busy: Promise<void> | null
}

const histCache = new Map<string, Hist>()

function newHist(file: string): Hist {
  return {
    tail: newTail(file), key: '', byId: new Map(), title: '', lastPrompt: '', branch: '', start: 0, end: 0,
    sums: { tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0, cost: 0 }, days: {}, data: null, busy: null,
  }
}

function addMsg(h: Hist, m: MsgCost, sign: 1 | -1) {
  h.sums.tokIn += sign * m.tokIn
  h.sums.tokOut += sign * m.tokOut
  h.sums.cacheR += sign * m.cacheR
  h.sums.cacheW += sign * m.cacheW
  h.sums.cost += sign * m.cost
  h.days[m.day] = (h.days[m.day] || 0) + sign * m.cost
}

function histLines(h: Hist, lines: string[]) {
  for (const line of lines) {
    if (!line.trim()) continue
    let e: any
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const ts = e.timestamp ? Date.parse(e.timestamp) : 0
    if (ts) {
      if (!h.start || ts < h.start) h.start = ts
      if (ts > h.end) h.end = ts
    }
    if (e.gitBranch) h.branch = e.gitBranch
    const pt = promptText(e)
    if (pt) {
      if (!h.title) h.title = pt
      h.lastPrompt = pt
    }
    if (e.type === 'assistant' && e.message?.usage) {
      const u = e.message.usage
      const x = { tokIn: u.input_tokens || 0, tokOut: u.output_tokens || 0, cacheR: u.cache_read_input_tokens || 0, cacheW: u.cache_creation_input_tokens || 0 }
      const m: MsgCost = { ...x, cost: costOf(e.message.model || '', x), day: dayKey(ts || h.start) }
      const id = e.message.id || e.uuid
      const old = h.byId.get(id)
      if (old) addMsg(h, old, -1)
      h.byId.set(id, m)
      addMsg(h, m, 1)
    }
  }
}

/** Brings a log file's history up to date with what is on disk. */
function refreshHist(file: string, st: fs.Stats): Promise<Hist> {
  let h = histCache.get(file)
  if (!h) histCache.set(file, h = newHist(file))
  const key = `${st.size}:${st.mtimeMs}`
  if (h.key === key) return Promise.resolve(h)
  const cur = h
  cur.busy ??= (async () => {
    if (st.size < cur.tail.offset) {
      // Rewritten from the start: read it again.
      Object.assign(cur, newHist(file))
    }
    try {
      await readAppended(cur.tail, st.size, lines => histLines(cur, lines))
      cur.key = key
    } catch {
      // Removed or locked; tried again next time.
    }
    const s = cur.sums
    cur.data = cur.byId.size
      ? { claudeId: path.basename(file, '.jsonl'), title: cur.lastPrompt || cur.title, branch: cur.branch, start: cur.start, end: cur.end, ...s, days: Object.fromEntries(Object.entries(cur.days).filter(([, v]) => Math.abs(v) > 1e-12)) }
      : null
  })().finally(() => { cur.busy = null })
  return cur.busy.then(() => cur)
}

let dirCache: { at: number; dirs: string[] } | null = null

/** The folders under ~/.claude/projects, re-listed at most every few seconds. */
async function projectDirs(): Promise<string[]> {
  if (dirCache && Date.now() - dirCache.at < 5000) return dirCache.dirs
  try {
    dirCache = { at: Date.now(), dirs: await fsp.readdir(projectsDir()) }
  } catch {
    dirCache = { at: Date.now(), dirs: [] }
  }
  return dirCache.dirs
}

/** Log files for a repo folder and its worktrees, with their stats. */
async function repoLogFiles(repoPath: string): Promise<{ file: string; st: fs.Stats }[]> {
  const enc = encodeCwd(repoPath).toLowerCase()
  const dirs = (await projectDirs()).filter(d => d.toLowerCase() === enc || d.toLowerCase().startsWith(enc + '-worktrees-'))
  const lists = await Promise.all(dirs.map(async (d) => {
    const full = path.join(projectsDir(), d)
    const files = (await fsp.readdir(full).catch(() => [] as string[])).filter(f => f.endsWith('.jsonl'))
    return Promise.all(files.map(f => fsp.stat(path.join(full, f)).then(st => ({ file: path.join(full, f), st }), () => null)))
  }))
  return lists.flat().filter(x => !!x)
}

/** All logged sessions for the given repo folders, including their worktrees. */
export async function projectHistory(repos: { id: string; path: string }[]): Promise<HistorySession[]> {
  const out: HistorySession[] = []
  for (const r of repos) {
    if (!r.path) continue
    for (const { file, st } of await repoLogFiles(r.path)) {
      const h = await refreshHist(file, st)
      if (h.data) out.push({ ...h.data, repoId: r.id })
    }
  }
  return out.sort((a, b) => b.start - a.start)
}

// ---------- One day's activity, for the daily summary ----------

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** A quiet gap longer than this counts as a break, not work. */
const IDLE_GAP = 15 * 60_000

function relTo(cwd: string, file: string) {
  const f = file.replace(/\\/g, '/'), c = (cwd || '').replace(/\\/g, '/').replace(/\/$/, '')
  return c && f.toLowerCase().startsWith(c.toLowerCase() + '/') ? f.slice(c.length + 1) : f
}

/** Each log's activity for a window, kept until the file or the window changes. */
const dayCache = new Map<string, { key: string; data: Omit<DaySession, 'repoId'> | null }>()

async function fileActivity(file: string, st: fs.Stats, repoPath: string, since: number, until: number): Promise<Omit<DaySession, 'repoId'> | null> {
  const key = `${st.size}:${st.mtimeMs}:${since}:${until}:${repoPath}`
  const hit = dayCache.get(file)
  if (hit?.key === key) return hit.data
  const prompts: { t: string; at: number }[] = [], files = new Set<string>(), replies: string[] = []
  const usage = new Map<string, { u: any; model: string }>()
  const spans: [number, number][] = []
  let start = 0, end = 0, branch = ''
  try {
    await readAppended(newTail(file), st.size, (lines) => {
      for (const line of lines) {
        if (!line.trim()) continue
        let e: any
        try {
          e = JSON.parse(line)
        } catch {
          continue
        }
        const ts = e.timestamp ? Date.parse(e.timestamp) : 0
        if (!ts || ts < since || ts >= until) continue
        if (!start) start = ts
        end = ts
        const cur = spans[spans.length - 1]
        if (cur && ts - cur[1] <= IDLE_GAP) cur[1] = Math.max(cur[1], ts)
        else spans.push([ts, ts])
        if (e.gitBranch) branch = e.gitBranch
        const pt = promptText(e)
        if (pt) prompts.push({ t: pt, at: ts })
        if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue
        if (e.message.usage) usage.set(e.message.id || e.uuid, { u: e.message.usage, model: e.message.model || '' })
        for (const c of e.message.content) {
          if (c.type === 'tool_use' && EDIT_TOOLS.has(c.name)) {
            const f = c.input?.file_path || c.input?.notebook_path
            if (f) files.add(relTo(e.cwd || repoPath, String(f)))
          } else if (c.type === 'text' && c.text?.trim()) {
            replies.push(c.text.trim())
          }
        }
      }
    })
  } catch {
    return null
  }
  let data: Omit<DaySession, 'repoId'> | null = null
  if (prompts.length || files.size) {
    let cost = 0
    for (const { u, model } of usage.values()) {
      cost += costOf(model, { tokIn: u.input_tokens || 0, tokOut: u.output_tokens || 0, cacheR: u.cache_read_input_tokens || 0, cacheW: u.cache_creation_input_tokens || 0 })
    }
    data = {
      claudeId: path.basename(file, '.jsonl'), branch, start, end, cost,
      prompts, files: [...files], lastReply: (replies[replies.length - 1] || '').slice(0, 1500), spans,
    }
  }
  dayCache.set(file, { key, data })
  return data
}

/** What Claude did in a repo between two times: prompts, edited files, its replies and the cost. */
export async function dayActivity(repos: { id: string; path: string }[], since: number, until: number): Promise<DaySession[]> {
  const out: DaySession[] = []
  for (const r of repos) {
    if (!r.path) continue
    for (const { file, st } of await repoLogFiles(r.path)) {
      if (st.mtimeMs < since) continue
      const d = await fileActivity(file, st, r.path, since, until)
      if (d) out.push({ ...d, repoId: r.id })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}
