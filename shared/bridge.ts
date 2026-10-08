// The API the preload script exposes as window.canopy.
import type { AppInfo, DayCommit, DaySession, GitSync, GitStatus, HistorySession, HookEvent, Persisted, GhProblem, PlanUsage, RepoInfo, ReviewRequest, ToolCheck, UpdateState, UsageUpdate, ShellInfo, ShellKind } from './types'

type Off = () => void

export interface CanopyApi {
  state: {
    load(): Promise<Persisted | null>
    save(s: Persisted): Promise<void>
  }
  pty: {
    spawn(o: { id: string; cwd: string; cmd: string; cols: number; rows: number }): Promise<{ pid: number }>
    shell(o: { id: string; cwd: string; kind: ShellKind; cols: number; rows: number }): Promise<{ pid: number }>
    /** A full-screen terminal app run from the home folder, such as gh-tui in the GitHub view. */
    tool(o: { id: string; cmd: string; dark: boolean; cols: number; rows: number }): Promise<{ pid: number }>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): Promise<void>
    buffer(id: string): Promise<string>
    onData(fn: (id: string, data: string) => void): Off
    onExit(fn: (id: string, code: number) => void): Off
  }
  session: {
    onHook(fn: (e: HookEvent) => void): Off
    onUsage(fn: (u: UsageUpdate) => void): Off
  }
  git: {
    info(path: string): Promise<RepoInfo>
    status(cwd: string): Promise<GitStatus>
    files(cwd: string): Promise<string[]>
    diff(cwd: string, file: string): Promise<string>
    read(cwd: string, file: string): Promise<string>
    worktreeAdd(repo: string, base: string, slug: string): Promise<{ path: string; branch: string }>
    merge(repo: string, wtPath: string, branch: string, base: string): Promise<{ ok: boolean; error?: string }>
    stage(cwd: string, paths: string[]): Promise<{ ok: boolean; error?: string }>
    unstage(cwd: string, paths: string[]): Promise<{ ok: boolean; error?: string }>
    /** Commits the staged changes, or everything when `all` is set. */
    commit(cwd: string, message: string, all: boolean): Promise<{ ok: boolean; error?: string }>
    sync(cwd: string): Promise<GitSync>
    push(cwd: string): Promise<{ ok: boolean; error?: string }>
    prUrl(cwd: string): Promise<{ ok: boolean; url?: string; error?: string }>
    /** A commit message for the current changes, written by Claude. */
    draftMessage(cwd: string): Promise<{ ok: boolean; text: string; error?: string }>
  }
  summary: {
    activity(repos: { id: string; path: string }[], since: number, until: number): Promise<{ sessions: DaySession[]; commits: DayCommit[] }>
  }
  claude: {
    /** A one-shot `claude -p` run (Haiku), for short writing jobs. */
    run(prompt: string): Promise<{ ok: boolean; text: string; error?: string }>
  }
  svc: {
    start(o: { id: string; cwd: string; cmd: string; port?: string }): Promise<void>
    stop(id: string): Promise<void>
    onData(fn: (id: string, data: string) => void): Off
    onStatus(fn: (id: string, status: 'starting' | 'running' | 'stopped', code?: number) => void): Off
  }
  history(repos: { id: string; path: string }[]): Promise<HistorySession[]>
  usage(): Promise<PlanUsage | null>
  gh: {
    /** Open pull requests waiting for the user's review, via the gh CLI. */
    reviews(): Promise<{ ok: boolean; prs: ReviewRequest[]; error?: string; problem?: GhProblem }>
    /** Finds the GitHub view's terminal app: the custom command, or gh-tui and then github-tui. */
    findTool(custom: string): Promise<ToolCheck>
  }
  sys: {
    openExternal(url: string): Promise<void>
    showInFolder(path: string): Promise<void>
    openEditor(editor: string, folder: string, file?: string): Promise<{ ok: boolean; error?: string }>
    pickFolder(): Promise<string | null>
    fonts(): Promise<{ name: string; nerd: boolean; mono: boolean }[]>
    shells(): Promise<ShellInfo[]>
    info(): Promise<AppInfo>
    saveImage(sid: string, name: string, bytes: Uint8Array): Promise<string>
    copyImage(file: string): Promise<void>
    saveImageAs(file: string): Promise<string | null>
    notify(o: { title: string; body: string; sid?: string; silent?: boolean; actions?: { label: string; key: string }[] }): Promise<void>
    onNotifyClick(fn: (sid: string) => void): Off
    /** A notification button was pressed; `key` is what that button sends. */
    onNotifyAction(fn: (sid: string, key: string) => void): Off
  }
  win: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
    onMaximized(fn: (v: boolean) => void): Off
    /** Registers the global summon shortcut ('' turns it off). False when another app already holds it. */
    summonKey(combo: string): Promise<boolean>
  }
  app: {
    quit(): Promise<void>
  }
  upd: {
    check(): Promise<void>
    download(): Promise<void>
    install(): Promise<void>
    state(): Promise<UpdateState | null>
    onStatus(fn: (s: UpdateState) => void): Off
  }
}
