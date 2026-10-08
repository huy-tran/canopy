// Reads Claude Code session logs (~/.claude/projects/<encoded cwd>/<session>.jsonl)
// for tokens, model, context use, and the per-project history used by Overview.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DaySession, HistorySession, UsageUpdate } from '../../shared/types'
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
    if (e.type !== 'assistant' || !e.message) continue
    const m = e.message
    if (m.model && m.model !== '<synthetic>') t.model = m.model
    const u = m.usage
    if (u) {
      byId.set(m.id || e.uuid, u)
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
      }
    }
  }
}

interface Watch {
  file: string
  offset: number
  rest: string
  byId: Map<string, any>
  totals: Totals
  timer: NodeJS.Timeout
}

const watches = new Map<string, Watch>()

function readNew(w: Watch): boolean {
  let st: fs.Stats
  try {
    st = fs.statSync(w.file)
  } catch {
    return false
  }
  if (st.size < w.offset) {
    w.offset = 0
    w.rest = ''
    w.byId.clear()
  }
  if (st.size === w.offset) return false
  const fd = fs.openSync(w.file, 'r')
  const buf = Buffer.alloc(st.size - w.offset)
  fs.readSync(fd, buf, 0, buf.length, w.offset)
  fs.closeSync(fd)
  w.offset = st.size
  const parts = (w.rest + buf.toString('utf8')).split('\n')
  w.rest = parts.pop() || ''
  accumulate(parts, w.byId, w.totals)
  return true
}

function totalsOf(w: Watch) {
  let tokIn = 0, tokOut = 0, cacheR = 0, cacheW = 0
  for (const u of w.byId.values()) {
    tokIn += u.input_tokens || 0
    tokOut += u.output_tokens || 0
    cacheR += u.cache_read_input_tokens || 0
    cacheW += u.cache_creation_input_tokens || 0
  }
  return { tokIn, tokOut, cacheR, cacheW }
}

/** Follows a transcript file and reports usage whenever it grows. */
export function watchTranscript(sid: string, claudeId: string, file: string, emit: (u: UsageUpdate) => void) {
  const old = watches.get(sid)
  if (old && old.file === file) return
  if (old) clearInterval(old.timer)
  const w: Watch = {
    file, offset: 0, rest: '', byId: new Map(),
    totals: { model: '', tokIn: 0, tokOut: 0, cacheR: 0, cacheW: 0, ctx: 0, lastText: '', lastPrompt: '', said: '', doing: '', latest: '' },
    timer: setInterval(() => tick(), 1500),
  }
  const tick = () => {
    if (!readNew(w)) return
    const t = totalsOf(w)
    const win = contextOf(w.totals.model)
    const { model, lastPrompt, said, doing, latest } = w.totals
    emit({ sid, claudeId, model, lastPrompt, said, doing, latest, ...t, ctx: win ? Math.min(100, (w.totals.ctx / win) * 100) : 0 })
  }
  watches.set(sid, w)
  tick()
}

export function lastAssistantText(sid: string): string {
  const w = watches.get(sid)
  if (!w) return ''
  readNew(w)
  return w.totals.lastText
}

export function unwatchTranscript(sid: string) {
  const w = watches.get(sid)
  if (w) clearInterval(w.timer)
  watches.delete(sid)
}

// ---------- History for Overview ----------

interface Cached { key: string; data: Omit<HistorySession, 'repoId'> | null }
const histCache = new Map<string, Cached>()

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

function parseSessionFile(file: string): Omit<HistorySession, 'repoId'> | null {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const byId = new Map<string, { u: any; model: string; ts: number }>()
  let title = '', lastPrompt = '', branch = '', start = 0, end = 0
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let e: any
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const ts = e.timestamp ? Date.parse(e.timestamp) : 0
    if (ts) {
      if (!start || ts < start) start = ts
      if (ts > end) end = ts
    }
    if (e.gitBranch) branch = e.gitBranch
    const pt = promptText(e)
    if (pt) {
      if (!title) title = pt
      lastPrompt = pt
    }
    if (e.type === 'assistant' && e.message?.usage) {
      byId.set(e.message.id || e.uuid, { u: e.message.usage, model: e.message.model || '', ts })
    }
  }
  if (!byId.size) return null
  let tokIn = 0, tokOut = 0, cacheR = 0, cacheW = 0, cost = 0
  const days: Record<string, number> = {}
  for (const { u, model, ts } of byId.values()) {
    const x = { tokIn: u.input_tokens || 0, tokOut: u.output_tokens || 0, cacheR: u.cache_read_input_tokens || 0, cacheW: u.cache_creation_input_tokens || 0 }
    tokIn += x.tokIn
    tokOut += x.tokOut
    cacheR += x.cacheR
    cacheW += x.cacheW
    const c = costOf(model, x)
    cost += c
    const k = dayKey(ts || start)
    days[k] = (days[k] || 0) + c
  }
  return { claudeId: path.basename(file, '.jsonl'), title: lastPrompt || title, branch, start, end, tokIn, tokOut, cacheR, cacheW, cost, days }
}

/** Log files for a repo folder and its worktrees, with their stats. */
function repoLogFiles(repoPath: string): { file: string; st: fs.Stats }[] {
  let dirs: string[] = []
  try {
    dirs = fs.readdirSync(projectsDir())
  } catch {
    return []
  }
  const enc = encodeCwd(repoPath).toLowerCase()
  const out: { file: string; st: fs.Stats }[] = []
  for (const d of dirs.filter(d => d.toLowerCase() === enc || d.toLowerCase().startsWith(enc + '-worktrees-'))) {
    const full = path.join(projectsDir(), d)
    let files: string[] = []
    try {
      files = fs.readdirSync(full).filter(f => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      try {
        out.push({ file: path.join(full, f), st: fs.statSync(path.join(full, f)) })
      } catch {
        // Removed while listing.
      }
    }
  }
  return out
}

/** All logged sessions for the given repo folders, including their worktrees. */
export function projectHistory(repos: { id: string; path: string }[]): HistorySession[] {
  const out: HistorySession[] = []
  for (const r of repos) {
    if (!r.path) continue
    for (const { file, st } of repoLogFiles(r.path)) {
      const key = `${st.size}:${st.mtimeMs}`
      let c = histCache.get(file)
      if (!c || c.key !== key) {
        c = { key, data: parseSessionFile(file) }
        histCache.set(file, c)
      }
      if (c.data) out.push({ ...c.data, repoId: r.id })
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

/** What Claude did in a repo between two times: prompts, edited files, its replies and the cost. */
export function dayActivity(repos: { id: string; path: string }[], since: number, until: number): DaySession[] {
  const out: DaySession[] = []
  for (const r of repos) {
    if (!r.path) continue
    for (const { file, st } of repoLogFiles(r.path)) {
      if (st.mtimeMs < since) continue
      let raw: string
      try {
        raw = fs.readFileSync(file, 'utf8')
      } catch {
        continue
      }
      const prompts: { t: string; at: number }[] = [], files = new Set<string>(), replies: string[] = []
      const usage = new Map<string, { u: any; model: string }>()
      const spans: [number, number][] = []
      let start = 0, end = 0, branch = ''
      for (const line of raw.split('\n')) {
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
            if (f) files.add(relTo(e.cwd || r.path, String(f)))
          } else if (c.type === 'text' && c.text?.trim()) {
            replies.push(c.text.trim())
          }
        }
      }
      if (!prompts.length && !files.size) continue
      let cost = 0
      for (const { u, model } of usage.values()) {
        cost += costOf(model, { tokIn: u.input_tokens || 0, tokOut: u.output_tokens || 0, cacheR: u.cache_read_input_tokens || 0, cacheW: u.cache_creation_input_tokens || 0 })
      }
      out.push({
        claudeId: path.basename(file, '.jsonl'), repoId: r.id, branch, start, end, cost,
        prompts, files: [...files], lastReply: (replies[replies.length - 1] || '').slice(0, 1500), spans,
      })
    }
  }
  return out.sort((a, b) => a.start - b.start)
}
