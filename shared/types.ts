// Types shared by the Electron main process and the Nuxt renderer.

export type Status = 'working' | 'waiting' | 'done' | 'idle'
export type Layout = 'tabs' | 'split' | 'grid'
export type View = 'terminals' | 'overview'
export type Editor = 'VS Code' | 'Cursor' | 'PhpStorm' | 'Zed'
export type ThemePref = 'dark' | 'light' | 'system'
export type WaitStyle = 'both' | 'highlight' | 'badge'
export type PanelDock = 'bottom' | 'right'
export type ShellKind = 'pwsh' | 'powershell' | 'gitbash' | 'wsl' | 'cmd'

/** A plain shell found on this machine. */
export interface ShellInfo {
  kind: ShellKind
  label: string
  exe: string
}

/** A pull request waiting for the user's review. */
export interface ReviewRequest {
  url: string
  number: number
  title: string
  /** owner/name */
  repo: string
  author: string
  createdAt: number
}

/** A repo in the 3D World's GitHub HQ: one of the user's most active, or one behind a Canopy project. */
export interface GhRepo {
  /** owner/name */
  name: string
  url: string
  private: boolean
  pushedAt: number
  /** Behind one of the user's Canopy projects. */
  canopy: boolean
  /** Open Dependabot alerts by severity (of the first 100) and in all; null when the user can't see them. */
  alerts: { critical: number; high: number; moderate: number; low: number; total: number } | null
  openPulls: number
}

/** Where an open pull request is: waiting on the user's review, approved, changes asked for, waiting on others, or a draft. */
export type GhReview = 'mine' | 'approved' | 'changes' | 'waiting' | 'draft'

export interface GhPull {
  url: string
  repo: string
  number: number
  title: string
  author: string
  createdAt: number
  review: GhReview
  /** The combined state of its latest commit's checks, if it has any. */
  checks: 'pass' | 'fail' | 'pending' | null
}

export interface GhRun {
  id: number
  url: string
  repo: string
  workflow: string
  /** What the run is for, such as a commit message or a PR title. */
  title: string
  branch: string
  /** What started it: push, pull_request, schedule, workflow_dispatch and so on. */
  event: string
  state: 'queued' | 'running' | 'success' | 'failure' | 'cancelled' | 'skipped'
  startedAt: number
}

/** An input a manually run workflow asks for, from its `workflow_dispatch` trigger. */
export interface GhWorkflowInput {
  name: string
  description: string
  required: boolean
  default: string
  type: 'string' | 'choice' | 'boolean' | 'number' | 'environment'
  /** The choices of a choice input, or the repo's environments for an environment input. */
  options: string[]
}

/** A workflow that can be run by hand, with what it asks for. */
export interface GhDispatchable {
  id: number
  name: string
  path: string
  inputs: GhWorkflowInput[]
}

/** A repo in the GitHub view's Repos list. */
export interface GhRepoInfo {
  /** owner/name */
  name: string
  url: string
  description: string
  private: boolean
  archived: boolean
  fork: boolean
  language: string
  defaultBranch: string
  stars: number
  pushedAt: number
}

/** A pull request opened in the GitHub view, with what's needed to review and merge it. */
export interface GhPullDetail {
  url: string
  repo: string
  number: number
  title: string
  body: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  draft: boolean
  author: string
  createdAt: number
  base: string
  head: string
  additions: number
  deletions: number
  files: { path: string; additions: number; deletions: number }[]
  /** Whether it merges cleanly: MERGEABLE, CONFLICTING or UNKNOWN while GitHub works it out. */
  mergeable: string
  /** Why it can or can't merge yet, such as CLEAN, BLOCKED (reviews or checks required) or BEHIND. */
  mergeState: string
  /** APPROVED, CHANGES_REQUESTED, REVIEW_REQUIRED, or empty when no review is required. */
  reviewDecision: string
  /** Who has reviewed and how, and who is asked to. */
  reviewers: { login: string; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING' | 'REQUESTED' }[]
  checks: { name: string; state: 'pass' | 'fail' | 'pending' | 'skipped'; url: string }[]
  comments: { author: string; body: string; at: number }[]
  /** The merge methods the repo allows, and whether the user may merge at all. */
  merge: { merge: boolean; squash: boolean; rebase: boolean; deleteBranch: boolean; allowed: boolean }
  /** The signed-in user opened it: GitHub won't let them approve it. */
  mine: boolean
}

export interface GhRunDetail {
  id: number
  repo: string
  url: string
  workflow: string
  title: string
  branch: string
  event: string
  state: GhRun['state']
  attempt: number
  createdAt: number
  jobs: { id: number; name: string; state: GhRun['state']; startedAt: number; completedAt: number; url: string; steps: { n: number; name: string; state: GhRun['state'] }[] }[]
}

/** An open Dependabot alert. */
export interface GhAlert {
  repo: string
  number: number
  severity: 'critical' | 'high' | 'moderate' | 'low'
  pkg: string
  ecosystem: string
  manifest: string
  summary: string
  ghsa: string
  /** The first version with the fix, if there is one yet. */
  fixed: string | null
  range: string
  url: string
  createdAt: number
}

/** What a gh call that changes something on GitHub came back with. */
export interface GhDone { ok: boolean; error?: string }

/** What is left of the hour's GitHub API allowance: REST calls and GraphQL points, and when each resets. */
export interface GhRateLimit {
  core: { limit: number; remaining: number; reset: number }
  graphql: { limit: number; remaining: number; reset: number }
  at: number
}

/** Everything the GitHub HQ in the 3D World shows. */
export interface GhWorld {
  repos: GhRepo[]
  pulls: GhPull[]
  runs: GhRun[]
  at: number
  error?: string
  problem?: GhProblem
}

/** Why gh could not be used: not installed, not signed in, or anything else (such as being offline). */
export type GhProblem = 'missing' | 'auth' | 'other'

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
  /** Terminal line height, as a multiple of the font size. */
  termLineHeight: number
  /** Font weight for normal and bold terminal text. */
  termWeight: number
  termWeightBold: number
  /** Extra space between characters, in px. */
  termLetterSpacing: number
  /** Terminal text colour: dimmer or brighter than the theme's. */
  termBrightness: 'dim' | 'normal' | 'bright'
  /** Raise the contrast of coloured text that is hard to read on the background. */
  termContrast: boolean
  /** Show bold text in the bright version of its colour. */
  termBoldBright: boolean
  cursorBlink: boolean
  cursor: 'Block' | 'Bar' | 'Underline'
  scrollback: string
  notifyWaiting: boolean
  notifyDone: boolean
  skipViewing: boolean
  sound: boolean
  dnd: boolean
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
  /** Notify when someone requests the user's review on a pull request. */
  reviewNotify: boolean
  /** Remind again every this many minutes while reviews are still waiting; 0 is off. */
  reviewRemind: number
  /** Repos (owner/name) GitHub HQ and the GitHub window leave out; review requests from them still come through. */
  ghHidden?: string[]
  /** Ask for a TOTP code before the AWS window reaches AWS, as aws-tui does (on unless turned off). */
  awsTotp: boolean
  /** How long an unlock lasts, in hours (4 unless set). */
  awsUnlockHours?: number
  /** AWS changes are only written to the audit log, never sent. */
  awsDryRun: boolean
  /** Opacity of the session window in the workspace simulation, 30-90: the characters always show through it. */
  simGlass?: number
  /** City for the workspace simulation's weather; empty uses the city in the system time zone. */
  weatherCity?: string
  /** File explorer layout, remembered between openings. */
  explorer?: ExplorerLayout
  /** Show Canopy's own memory, CPU and frame rate in the status bar. */
  showMetrics: boolean
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

/** A subagent a Claude session started with its Task or Agent tool, alive until it finishes. */
export interface Subagent {
  /** The tool call that started it. */
  id: string
  /** Subagent type, such as "general-purpose" or "Explore". */
  type: string
  desc: string
  /** Started in the background: it outlives its tool call and ends with SubagentStop. */
  bg: boolean
  /** Claude Code's id for a background subagent, which its SubagentStop carries. */
  agentId?: string
  at: number
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
  /** Claude's latest line of narration and latest tool call in plain words, and which came last. */
  said?: string
  doing?: string
  latest?: 'said' | 'doing' | ''
  /** The kind of tool Claude is using now, and how its latest command turned out. */
  act?: Act | ''
  result?: ToolResult | null
}

/** What a character in the workspace simulation acts out while Claude uses a tool. */
export type Act = 'read' | 'write' | 'run' | 'test' | 'web' | 'plan' | 'delegate'

/** A finished command: whether it failed, whether it ran tests, and when it was logged. */
export interface ToolResult {
  ok: boolean
  test: boolean
  at: number
}

export interface Activity {
  act: Act | ''
  result: ToolResult | null
}

/** What a session's character says over their head in the workspace simulation. */
export interface Chatter {
  text: string
  kind: 'said' | 'doing'
  at: number
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

/** One of Canopy's own processes (main, renderer, GPU, utility). */
export interface ProcMetric {
  type: string
  name?: string
  memMB: number
  /** Percent of one CPU core. */
  cpu: number
}

/** Canopy's own resource use, sampled by the main process. */
export interface AppMetrics {
  at: number
  /** Working set of every Canopy process, in MB. */
  memMB: number
  /** CPU of every Canopy process, as a percent of the whole machine. */
  cpu: number
  procs: ProcMetric[]
  /** Share of the time the main process was busy since the last sample, in percent. */
  busy: number
  /** How late the main process ran its timers over the last sample, in ms (mean and worst). */
  lagMs: number
  lagMaxMs: number
  /** Live terminals, and the terminal output they produced per second. */
  ptys: number
  ptyKBps: number
  /** Messages the main process sent to the window per second. */
  ipcPerSec: number
}
