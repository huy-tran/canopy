// Types shared by the Electron main process and the Nuxt renderer.

export type Status = 'working' | 'waiting' | 'done' | 'idle'
export type Layout = 'tabs' | 'split' | 'grid'
export type View = 'terminals' | 'overview'
export type Editor = 'VS Code' | 'Cursor' | 'PhpStorm' | 'Zed'
export type ThemePref = 'dark' | 'light' | 'system'
export type WaitStyle = 'both' | 'highlight' | 'badge'
export type WindowBlur = 'acrylic' | 'mica'
export type PanelDock = 'bottom' | 'right'
export type ShellKind = 'pwsh' | 'powershell' | 'gitbash' | 'wsl' | 'cmd'

/** A plain shell found on this machine. */
export interface ShellInfo {
  kind: ShellKind
  label: string
  exe: string
}

export interface Service {
  id: string
  cmd: string
  port: string
}

export interface Repo {
  id: string
  label: string
  path: string
  cmd: string
  stack: string
  branch: string
  services: Service[]
}

export interface Project {
  id: string
  name: string
  hue: number
  repos: Repo[]
  layout: Layout
  view: View
  expanded: boolean
  autoStart: boolean
  autoServices: boolean
  resume: boolean
  editor: Editor
  createdAt: number
  /** Pinned to the Starred section at the top of the sidebar. */
  starred?: boolean
}

export interface Worktree {
  path: string
  base: string
}

export interface SessionImage {
  n: number
  name: string
  path: string
  src: string
  pending: boolean
  prompt?: number
}

export interface Session {
  id: string
  /** A Claude Code session, or a plain shell (no hooks, status, cost or notifications). */
  kind: 'claude' | 'shell'
  /** Which shell, for kind 'shell'. */
  shell?: ShellKind
  /** Shells opened in the dock panel instead of as a pane. */
  docked?: boolean
  pid: string
  repoId: string
  cwd: string
  cmd: string
  title: string
  status: Status
  branch: string
  wt: Worktree | null
  model: string
  ctx: number
  tokIn: number
  tokOut: number
  cacheR: number
  cacheW: number
  images: SessionImage[]
  started: number
  lastAt: number
  endedAt: number | null
  waitingSince: number | null
  waitWhat: string
  perm: boolean
  promptCount: number
  prompts: { t: string; at: number }[]
  claudeId: string
  changed: string[]
  editing: string
  exited: boolean
}

export interface Prefs {
  editor: Editor
  startCmd: string
  launchLogin: boolean
  tray: boolean
  resume: boolean
  autoUpdate: boolean
  waitStyle: WaitStyle
  showCost: boolean
  appFont: string
  termFont: string
  termSize: number
  cursor: 'Block' | 'Bar' | 'Underline'
  scrollback: string
  notifyWaiting: boolean
  notifyDone: boolean
  skipViewing: boolean
  sound: boolean
  dnd: boolean
  /** Window background opacity, 50-100. Below 100 the window shows the blur effect behind it. */
  opacity: number
  blur: WindowBlur
  /** Terminal colours: always dark (Claude Code's default theme), or follow the app theme. */
  termTheme: 'dark' | 'app'
  /** Default plain shell for new shell terminals. */
  shell: ShellKind
  /** Where the shells and dev server logs panel docks. */
  panelDock: PanelDock
  /** Panel height when docked at the bottom and width when docked on the right, in px. */
  panelSize: { bottom: number; right: number }
  /** System-wide shortcut that brings Canopy to the front, or hides it when it's already focused. Empty means off. */
  summonKey: string
  /** File explorer layout, remembered between openings. */
  explorer?: ExplorerLayout
}

export interface ExplorerLayout {
  /** Tree panel width as a share of the explorer, 0-1. */
  tree: number
  /** Window size in px when not maximized. */
  w: number
  h: number
  max: boolean
  /** Wrap long lines in the file and diff view. */
  wrap: boolean
}

export interface Persisted {
  projects: Project[]
  prefs: Prefs
  keys: Record<string, string[]>
  theme: ThemePref
  sel: string | null
  stripOn: boolean
  /** Open sessions and shells, reopened on the next launch. */
  sessions?: SavedSession[]
  /** Focused session per project. */
  focus?: Record<string, string | null>
  /** Daily summary recaps and their timesheet hours, keyed by "<project id>:<day start>". Last 7 days only. */
  recaps?: Record<string, string>
  recapHours?: Record<string, RecapHours>
  /** Dock panel (shells and server logs) per project: open or hidden, and the tab in view. */
  panels?: Record<string, DockPanelState>
}

export interface DockPanelState {
  open: boolean
  /** Shell session or dev server id. */
  tab: string | null
}

export interface RecapHours {
  /** Claude's estimate of the hours the work would take. */
  estimate?: number
  /** Hours typed in for the timesheet. */
  hours?: string
}

/** Enough of a session to reopen it after a restart. */
export interface SavedSession {
  id: string
  kind: 'claude' | 'shell'
  shell?: ShellKind
  docked?: boolean
  pid: string
  repoId: string
  cwd: string
  cmd: string
  title: string
  branch: string
  wt: Worktree | null
  claudeId: string
  /** The conversation has messages on disk, so `claude --resume <id>` can reopen it. */
  resumable: boolean
  started: number
  prompts: { t: string; at: number }[]
}

/** Event forwarded from a Claude Code hook (posted by curl to the main process). */
export interface HookEvent {
  sid: string
  event: string
  payload: Record<string, any>
  /** For Stop: the last assistant text, read from the transcript. */
  lastText?: string
}

export interface UsageUpdate {
  sid: string
  claudeId: string
  model: string
  tokIn: number
  tokOut: number
  cacheR: number
  cacheW: number
  ctx: number
  /** Last prompt in the transcript; titles resumed sessions. */
  lastPrompt: string
}

export interface GitChange {
  p: string
  st: 'M' | 'A' | 'D'
  a: number
  d: number
  staged: boolean
}

export interface GitStatus {
  isRepo: boolean
  branch: string
  changes: GitChange[]
}

export interface RepoInfo {
  exists: boolean
  isRepo: boolean
  branch: string
  stack: string
}

export interface PlanUsage {
  five: { pct: number; resetsAt: number } | null
  week: { pct: number; resetsAt: number } | null
}

/** A past (or live) Claude Code session read from ~/.claude/projects JSONL logs. */
export interface HistorySession {
  claudeId: string
  repoId: string
  title: string
  branch: string
  start: number
  end: number
  tokIn: number
  tokOut: number
  cacheR: number
  cacheW: number
  cost: number
  /** Cost per local day, keyed YYYY-MM-DD. */
  days: Record<string, number>
}

export interface UpdateState {
  status: 'checking' | 'available' | 'current' | 'downloading' | 'ready' | 'error'
  version?: string
  pct?: number
  total?: number
  notes?: string[]
  error?: string
}

export interface AppInfo {
  version: string
  electron: string
  chromium: string
  node: string
  claudeVersion: string
  claudePath: string
  windows: string
}

/** One Claude Code session's activity within a day, for the daily summary. */
export interface DaySession {
  claudeId: string
  repoId: string
  branch: string
  start: number
  end: number
  cost: number
  prompts: { t: string; at: number }[]
  /** Files Claude created or edited, relative to the repo. */
  files: string[]
  /** Claude's last reply in the window: usually its summary of the work. */
  lastReply: string
  /** Stretches of activity as [start, end], split wherever the log goes quiet for 15 minutes. */
  spans: [number, number][]
}

export interface DayCommit {
  repoId: string
  hash: string
  subject: string
  files: number
  ins: number
  del: number
  at: number
}

export interface GitSync {
  branch: string
  upstream: string
  ahead: number
  behind: number
  remote: string
}
