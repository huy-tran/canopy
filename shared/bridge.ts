// The API the preload script exposes as window.canopy.
import type { AppInfo, AppMetrics, DayCommit, DaySession, GitSync, GitStatus, HistorySession, HookEvent, Persisted, GhAlert, GhDispatchable, GhDone, GhProblem, GhPull, GhPullDetail, GhRateLimit, GhRepoInfo, GhRun, GhRunDetail, GhWorld, PlanUsage, RepoInfo, ReviewRequest, UpdateState, UsageUpdate, ShellInfo, ShellKind } from './types'
import type { AwsBookmark, AwsCtx, AwsDone, AwsEnrolment, AwsLockState, AwsProfile, AwsRegionStatus, AwsResult, AwsSearchItem, AwsState, AwsTerm, AwsWorld, CdApp, CdDeployment, CdGroup, CfDistribution, CfInvalidation, EbEnv, EbEvent, EbVersion, EcResource, EcServiceUpdate, EcUpdateAction, Ec2Instance, LogEvent, LogGroup, LogStream, LogTailMsg, RdsInstance, S3Bucket, S3Entry, ShFinding, ShFindingsQuery, ShInsight, ShInsightResult, SsmParam, SsmParamValue, SsmParamVersion } from './aws'

/** The AWS calls, one IPC channel each (`aws:<name>`); main and preload are both built from this list. */
export const AWS_CALLS = [
  'lockState', 'unlock', 'lock', 'enrolStart', 'enrolFinish', 'profiles', 'state', 'remember', 'saveBookmarks', 'forget',
  'regions', 'world', 'cachedWorld', 'search', 'term',
  'ec2Instances', 'ec2Console', 'ec2Power',
  'ebEnvs', 'ebEvents', 'ebVersions', 'ebDeploy',
  'rdsInstances',
  'ecResources', 'ecUpdates', 'ecServiceUpdate', 'ecApply',
  'logGroups', 'logStreams', 'logEvents', 'logSearch', 'tailStart', 'tailStop',
  'cfDistributions', 'cfInvalidations', 'cfInvalidate',
  's3Buckets', 's3List', 's3Download', 's3Delete', 's3PickUpload', 's3Existing', 's3Upload',
  'params', 'paramValue', 'paramHistory', 'paramPut',
  'shInsights', 'shInsightResults', 'shFindings',
  'cdApps', 'cdGroups', 'cdDeployments',
] as const

/** The AWS window's calls, made with the AWS SDK in the main process. Reads take `force` to skip the cache. */
export interface AwsApi {
  /** Whether AWS is unlocked, enrolled, and only dry-running its changes. */
  lockState(): Promise<AwsLockState>
  /** Unlocks with a TOTP or backup code; `waitMs` after a wrong one. */
  unlock(code: string): Promise<{ ok: boolean; error?: string; waitMs?: number }>
  lock(): Promise<void>
  enrolStart(): Promise<AwsEnrolment>
  /** Confirms a new TOTP secret with its first code; returns ten one-time backup codes. */
  enrolFinish(code: string): Promise<{ ok: boolean; error?: string; codes?: string[] }>
  profiles(): Promise<AwsProfile[]>
  /** The last profile and regions and the bookmarks, shared with aws-tui. */
  state(): Promise<AwsState>
  remember(profile: string, region: string): Promise<void>
  saveBookmarks(profile: string, list: AwsBookmark[]): Promise<void>
  /** Forgets a profile's credentials, after an SSO sign-in. */
  forget(profile: string): Promise<void>
  regions(ctx: AwsCtx): Promise<AwsResult<AwsRegionStatus[]>>
  /** EC2 instances and Beanstalk environments, for the window and the 3D World's data centre. */
  world(ctx: AwsCtx, force: boolean): Promise<AwsWorld>
  cachedWorld(): Promise<AwsWorld | null>
  search(ctx: AwsCtx): Promise<{ items: AwsSearchItem[]; failed: string[] }>
  /** Starts an AWS CLI session in a terminal: an SSM shell, a port forward, a log tail or an SSO sign-in. */
  term(ctx: AwsCtx, id: string, o: { kind: AwsTerm['kind']; instance?: string; remotePort?: number; localPort?: number; host?: string; group?: string }, cols: number, rows: number): Promise<{ ok: boolean; cmd?: string; error?: string }>
  ec2Instances(ctx: AwsCtx, force: boolean): Promise<AwsResult<Ec2Instance[]>>
  ec2Console(ctx: AwsCtx, id: string, latest: boolean): Promise<AwsResult<string>>
  ec2Power(ctx: AwsCtx, id: string, what: 'stop' | 'start' | 'reboot', name: string, stateBefore: string): Promise<AwsDone>
  ebEnvs(ctx: AwsCtx, force: boolean): Promise<AwsResult<EbEnv[]>>
  ebEvents(ctx: AwsCtx, env: string): Promise<AwsResult<EbEvent[]>>
  ebVersions(ctx: AwsCtx, app: string, force: boolean): Promise<AwsResult<EbVersion[]>>
  ebDeploy(ctx: AwsCtx, env: string, version: string): Promise<AwsDone>
  rdsInstances(ctx: AwsCtx, force: boolean): Promise<AwsResult<RdsInstance[]>>
  ecResources(ctx: AwsCtx, force: boolean): Promise<AwsResult<EcResource[]>>
  ecUpdates(ctx: AwsCtx, force: boolean): Promise<AwsResult<EcUpdateAction[]>>
  ecServiceUpdate(ctx: AwsCtx, name: string, force: boolean): Promise<AwsResult<EcServiceUpdate | null>>
  ecApply(ctx: AwsCtx, update: string, resource: string, kind: EcUpdateAction['resourceKind'], severity: string): Promise<AwsDone>
  logGroups(ctx: AwsCtx, token: string | null, force: boolean): Promise<AwsResult<{ groups: LogGroup[]; next: string | null }>>
  logStreams(ctx: AwsCtx, group: string, force: boolean): Promise<AwsResult<LogStream[]>>
  logEvents(ctx: AwsCtx, group: string, stream: string): Promise<AwsResult<LogEvent[]>>
  logSearch(ctx: AwsCtx, group: string, pattern: string, start: number, end: number): Promise<AwsResult<{ events: LogEvent[]; more: boolean }>>
  /** Follows a log group live; events arrive through onTail. */
  tailStart(ctx: AwsCtx, id: string, groupArn: string): Promise<void>
  tailStop(id: string): Promise<void>
  onTail(fn: (m: LogTailMsg) => void): () => void
  cfDistributions(ctx: AwsCtx, force: boolean): Promise<AwsResult<CfDistribution[]>>
  cfInvalidations(ctx: AwsCtx, dist: string, force: boolean): Promise<AwsResult<CfInvalidation[]>>
  cfInvalidate(ctx: AwsCtx, dist: string, paths: string[]): Promise<AwsDone>
  s3Buckets(ctx: AwsCtx, force: boolean): Promise<AwsResult<S3Bucket[]>>
  s3List(ctx: AwsCtx, bucket: string, region: string, prefix: string, force: boolean): Promise<AwsResult<{ entries: S3Entry[]; truncated: boolean }>>
  /** Asks where to save, then downloads; null data when the user cancelled. */
  s3Download(ctx: AwsCtx, bucket: string, region: string, key: string): Promise<AwsResult<string | null>>
  s3Delete(ctx: AwsCtx, bucket: string, region: string, keys: string[]): Promise<AwsDone>
  /** Asks for files to upload. */
  s3PickUpload(): Promise<{ path: string; size: number }[]>
  s3Existing(ctx: AwsCtx, bucket: string, region: string, keys: string[]): Promise<AwsResult<string[]>>
  s3Upload(ctx: AwsCtx, bucket: string, region: string, file: string, key: string): Promise<AwsDone>
  params(ctx: AwsCtx, force: boolean): Promise<AwsResult<SsmParam[]>>
  paramValue(ctx: AwsCtx, meta: SsmParam, version?: number): Promise<AwsResult<SsmParamValue>>
  paramHistory(ctx: AwsCtx, name: string): Promise<AwsResult<SsmParamVersion[]>>
  paramPut(ctx: AwsCtx, o: { name: string; value: string; type: string; overwrite: boolean; description?: string; keyId?: string }): Promise<AwsDone>
  shInsights(ctx: AwsCtx, force: boolean): Promise<AwsResult<ShInsight[]>>
  shInsightResults(ctx: AwsCtx, arn: string): Promise<AwsResult<ShInsightResult[]>>
  shFindings(ctx: AwsCtx, q: ShFindingsQuery): Promise<AwsResult<{ findings: ShFinding[]; capped: boolean }>>
  cdApps(ctx: AwsCtx, force: boolean): Promise<AwsResult<CdApp[]>>
  cdGroups(ctx: AwsCtx, app: string, force: boolean): Promise<AwsResult<CdGroup[]>>
  cdDeployments(ctx: AwsCtx, app: string, group: string, force: boolean): Promise<AwsResult<CdDeployment[]>>
}

// Every listed call is in the interface, and every method but onTail is listed.
type _Calls = (typeof AWS_CALLS)[number]
const _check: Record<Exclude<keyof AwsApi, 'onTail'>, true> = Object.fromEntries(AWS_CALLS.map(c => [c, true])) as Record<_Calls, true>
void _check

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
    /** Repos, open PRs and workflow runs for the 3D World's GitHub HQ: the repos behind these folders and the user's most active, less the hidden ones. */
    world(folders: string[], hidden: string[]): Promise<GhWorld>
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
  aws: AwsApi
  sys: {
    openExternal(url: string): Promise<void>
    showInFolder(path: string): Promise<void>
    openEditor(editor: string, folder: string, file?: string): Promise<{ ok: boolean; error?: string }>
    pickFolder(): Promise<string | null>
    fonts(): Promise<{ name: string; nerd: boolean; mono: boolean }[]>
    shells(): Promise<ShellInfo[]>
    info(): Promise<AppInfo>
    /** Canopy's own memory, CPU, main-thread lag and terminal traffic since the last call. */
    metrics(): Promise<AppMetrics | null>
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
