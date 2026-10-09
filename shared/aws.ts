// Shapes for the AWS window and the 3D World's data centre, read with the AWS SDK in the main
// process. Times are epoch milliseconds (0 when unknown); the window shows them in local time.

/** The services, in the order the window lists them; the names match aws-tui's tabs, for shared bookmarks. */
export const AWS_TABS = ['Beanstalk', 'EC2', 'RDS', 'ElastiCache', 'Logs', 'CloudFront', 'S3', 'Parameter Store', 'SecurityHub', 'CodeDeploy'] as const
export type AwsTab = (typeof AWS_TABS)[number]

/** Which profile and region a call is for. */
export interface AwsCtx {
  profile: string
  region: string
}

/**
 * Why a call failed: AWS locked behind its TOTP code, an SSO sign-in that has run out, no usable
 * credentials, a permission AWS refused, or anything else.
 */
export type AwsProblem = 'locked' | 'sso' | 'creds' | 'denied' | 'other'

export type AwsResult<T> = { ok: true; data: T; at?: number } | { ok: false; error: string; problem: AwsProblem }

/** The outcome of a change; `dryRun` when it was only logged. */
export interface AwsDone {
  ok: boolean
  error?: string
  problem?: AwsProblem
  dryRun?: boolean
  /** Something the change returned, such as an invalidation id. */
  result?: string
}

export interface AwsProfile {
  name: string
  region: string
  source: 'sso' | 'assume-role' | 'static' | 'unknown'
  ssoStartUrl: string
}

export interface AwsRegionStatus {
  name: string
  /** 'opt-in-not-required' | 'opted-in' | 'not-opted-in' */
  status: string
}

export interface AwsBookmark {
  tab: string
  region: string
  id: string
  label: string
  added_at: string
}

/** What is kept between launches, shared with aws-tui's state.json. */
export interface AwsState {
  lastProfile: string
  lastRegions: Record<string, string>
  bookmarks: Record<string, AwsBookmark[]>
}

/** Whether AWS is unlocked, and the enrolment details on a first run. */
export interface AwsLockState {
  /** TOTP is turned off in Settings, or the unlock marker is still fresh. */
  unlocked: boolean
  /** No secret yet: the first unlock enrols one. */
  enrolled: boolean
  /** When the current unlock runs out, or 0. */
  until: number
  /** Writes are only logged, never sent. */
  dryRun: boolean
  /** Why writes are dry: Canopy's setting, or AWS_TUI_DRY_RUN in the environment. */
  dryRunFrom: 'setting' | 'env' | null
}

export interface AwsEnrolment {
  secret: string
  url: string
  /** The otpauth URL as a QR code image. */
  qr: string
}

// ---------- Beanstalk ----------

export interface EbEnv {
  app: string
  env: string
  id: string
  cname: string
  status: string
  health: string
  version: string
  platform: string
  tier: string
  updatedAt: number
}

export interface EbEvent {
  at: number
  severity: string
  message: string
}

export interface EbVersion {
  label: string
  description: string
  createdAt: number
  status: string
}

// ---------- EC2 ----------

export interface Ec2Instance {
  id: string
  name: string
  state: string
  type: string
  privIp: string
  pubIp: string
  pubDns: string
  vpc: string
  subnet: string
  az: string
  platform: string
  ami: string
  iamRole: string
  launchedAt: number
  securityGroups: string[]
  tags: { key: string; value: string }[]
}

// ---------- RDS ----------

export interface RdsInstance {
  id: string
  engine: string
  engineVersion: string
  status: string
  endpoint: string
  port: number
  class: string
  multiAz: boolean
  dbName: string
  masterUser: string
  vpc: string
  subnetGroup: string
  securityGroups: string[]
  allocatedGb: number
  storageType: string
  iops: number
  createdAt: number
}

// ---------- ElastiCache ----------

export interface EcResource {
  id: string
  kind: 'replication-group' | 'cache-cluster'
  engine: string
  engineVersion: string
  nodeType: string
  status: string
  description: string
  endpoint: string
  port: number
  nodes: number
  shards: number
  clusterMode: string
  multiAz: string
  autoFailover: string
  members: string[]
}

export interface EcUpdateAction {
  serviceUpdate: string
  resource: string
  resourceKind: 'replication-group' | 'cache-cluster'
  engine: string
  severity: string
  type: string
  serviceUpdateStatus: string
  status: string
  releasedAt: number
  applyBy: number
  availableAt: number
  statusChangedAt: number
  nodesUpdated: string
  estimatedTime: string
  slaMet: string
  nodes: { node: string; status: string; startedAt: number; endedAt: number }[]
}

export interface EcServiceUpdate {
  name: string
  description: string
  engine: string
  engineVersion: string
  severity: string
  type: string
  status: string
  releasedAt: number
  endsAt: number
  applyBy: number
  estimatedTime: string
  autoUpdate: boolean
}

// ---------- CloudWatch Logs ----------

export interface LogGroup {
  name: string
  arn: string
  /** Retention in days, 0 for never expire. */
  retention: number
  bytes: number
}

export interface LogStream {
  name: string
  lastEvent: number
}

export interface LogEvent {
  at: number
  stream: string
  message: string
}

/** A live tail's news: lines, or that it started, stopped or failed. */
export interface LogTailMsg {
  id: string
  events?: LogEvent[]
  state?: 'live' | 'ended' | 'error'
  error?: string
}

// ---------- CloudFront ----------

export interface CfDistribution {
  id: string
  domain: string
  origin: string
  status: string
  enabled: boolean
  aliases: string[]
}

export interface CfInvalidation {
  id: string
  status: string
  createdAt: number
}

// ---------- S3 ----------

export interface S3Bucket {
  name: string
  region: string
  createdAt: number
}

export interface S3Entry {
  key: string
  /** A folder: a common prefix ending in "/". */
  folder: boolean
  size: number
  modifiedAt: number
}

// ---------- Parameter Store ----------

export interface SsmParam {
  name: string
  type: string
  version: number
  modifiedAt: number
  modifiedBy: string
  description: string
  keyId: string
}

export interface SsmParamValue extends SsmParam {
  value: string
}

export interface SsmParamVersion {
  version: number
  modifiedAt: number
  modifiedBy: string
  type: string
}

// ---------- SecurityHub ----------

export interface ShInsight {
  arn: string
  name: string
  groupBy: string
  attr: string
  owner: 'AWS' | 'You'
}

export interface ShInsightResult {
  value: string
  count: number
}

export interface ShFinding {
  id: string
  title: string
  description: string
  severity: string
  workflow: string
  recordState: string
  product: string
  account: string
  region: string
  updatedAt: number
  resources: { arn: string; type: string }[]
  compliance: string
  standards: string
  remediation: { text: string; url: string }
}

/** Findings filters: the group an insight result stands for, and the severities and suppressed ones to show. */
export interface ShFindingsQuery {
  /** The insight's group-by attribute and the value picked, or null for every active finding. */
  group: { attr: string; value: string } | null
}

// ---------- CodeDeploy ----------

export interface CdApp {
  name: string
  platform: string
  createdAt: number
}

export interface CdGroup {
  name: string
  platform: string
  config: string
  lastStatus: string
  lastAt: number
  serviceRole: string
}

export interface CdDeployment {
  id: string
  status: string
  creator: string
  createdAt: number
  completedAt: number
  app: string
  group: string
  config: string
  description: string
  revision: string
  errCode: string
  errMessage: string
  succeeded: number
  failed: number
  inProgress: number
  pending: number
  skipped: number
}

// ---------- Finder, data centre ----------

export interface AwsSearchItem {
  tab: AwsTab
  label: string
  detail: string
  query: string
}

/** EC2 instances and Beanstalk environments for the 3D World's data centre and the window's lists. */
export interface AwsWorld {
  profile: string
  region: string
  instances: Ec2Instance[]
  envs: EbEnv[]
  at: number
  error?: string
  problem?: AwsProblem
}

/** An interactive AWS CLI session in a terminal: an SSM shell, a port forward, a log tail, an SSO sign-in. */
export interface AwsTerm {
  id: string
  title: string
  kind: 'shell' | 'forward' | 'tail' | 'login'
  /** The command line, shown above the terminal. */
  cmd: string
  startedAt: number
  exited: boolean
  code?: number
}
