// The API the preload script exposes as window.canopy.
import type { AppInfo, DayCommit, DaySession, GitSync, GitStatus, HistorySession, HookEvent, Persisted, GhAlert, GhDispatchable, GhDone, GhProblem, GhPull, GhPullDetail, GhRateLimit, GhRepoInfo, GhRun, GhRunDetail, GhWorld, PlanUsage, RepoInfo, ReviewRequest, UpdateState, UsageUpdate, ShellInfo, ShellKind } from './types'

type Off = () => void

export interface CanopyApi {
  state: {
    load(): Promise<Persisted | null>
    save(s: Persisted): Promise<void>
  }
  pty: {
    spawn(o: { id: string; cwd: string; cmd: string; cols: number; rows: number }): Promise<{ pid: number }>
    shell(o: { id: string; cwd: string; kind: ShellKind; cols: number; rows: number }): Promise<{ pid: number }>
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
    /** Repos, open PRs and workflow runs for the 3D World's GitHub HQ: the repos behind these folders and the user's most active. */
    world(folders: string[]): Promise<GhWorld>
    /** GitHub HQ's last good read, saved on disk, or null before the first. */
    cachedWorld(): Promise<GhWorld | null>
    /** Every workflow run in these repos from the last week. */
    runs(repos: string[]): Promise<GhRun[]>
    /** What is left of the hour's GitHub API allowance; asking doesn't use any. */
    rateLimit(): Promise<GhRateLimit | null>
    /** Open PRs from a GitHub search filter such as `review-requested:@me` or `author:@me`. */
    search(filter: string): Promise<{ ok: boolean; pulls: GhPull[]; error?: string; problem?: GhProblem }>
    pull(url: string): Promise<{ ok: boolean; pull?: GhPullDetail; error?: string }>
    pullDiff(url: string): Promise<{ ok: boolean; diff?: string; error?: string }>
    review(url: string, kind: 'approve' | 'request-changes' | 'comment', body: string): Promise<GhDone>
    merge(url: string, method: 'merge' | 'squash' | 'rebase', deleteBranch: boolean): Promise<GhDone>
    run(repo: string, id: number): Promise<{ ok: boolean; run?: GhRunDetail; error?: string }>
    /** A job's log, or without `job` the failed steps' logs of the run. */
    runLog(repo: string, id: number, job?: number): Promise<{ ok: boolean; log?: string; error?: string }>
    rerun(repo: string, id: number, failedOnly: boolean): Promise<GhDone>
    cancel(repo: string, id: number): Promise<GhDone>
    alerts(repos: string[]): Promise<GhAlert[]>
    /** Every repo the user can reach, most recently pushed first. */
    repos(): Promise<{ ok: boolean; repos: GhRepoInfo[]; error?: string; problem?: GhProblem }>
    /** The repo's workflows that can be run by hand, with their inputs. */
    dispatchables(repo: string): Promise<{ ok: boolean; workflows: GhDispatchable[]; error?: string }>
    branches(repo: string): Promise<string[]>
    runWorkflow(repo: string, id: number, ref: string, inputs: Record<string, string>): Promise<GhDone>
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
