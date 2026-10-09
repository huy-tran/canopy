// Words, colours and links for the AWS window, after aws-tui's: local times with their zone, state
// and health colours, the profile pill's colour by name, and related resources across services.
import type { AwsTab, CfDistribution, EbEnv, Ec2Instance, LogGroup, RdsInstance, S3Bucket } from '#shared/aws'

/** "2026-10-09 14:05:33 AEST": every time in the window, in local time with its zone. */
export function awsTime(ms: number, seconds = true) {
  if (!ms) return '-'
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  const zone = d.toLocaleTimeString('en-AU', { timeZoneName: 'short' }).split(' ').pop() || ''
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}${seconds ? `:${p(d.getSeconds())}` : ''} ${zone}`
}

export function awsDate(ms: number) {
  return ms ? awsTime(ms).slice(0, 10) : '-'
}

/** "12:05:33", for log lines. */
export function awsClock(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function bytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

/** "3d", "5h", "12m", "40s" since a time. */
export function age(ms: number, now = Date.now()) {
  if (!ms) return '-'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

const GRN = 'var(--grn)', AMB = 'var(--amb)', RED = 'var(--red)', MU = 'var(--mu)'

/** The profile pill: prod red, staging orange, dev and test green, anything else blue. */
export function profileColor(name: string) {
  const n = name.toLowerCase()
  if (n.startsWith('prod')) return '#d7263d'
  if (n.startsWith('staging')) return '#f59e0b'
  if (n.startsWith('dev') || n.startsWith('test')) return '#16a34a'
  return '#2f80ed'
}

export function ec2StateColor(s: string) {
  if (s === 'running') return GRN
  if (['pending', 'stopping', 'shutting-down'].includes(s)) return AMB
  if (s === 'terminated') return RED
  return MU
}

export function ebHealthColor(h: string) {
  return ({ Green: GRN, Yellow: AMB, Red: RED } as Record<string, string>)[h] || MU
}

export function ebStatusColor(s: string) {
  if (s === 'Ready') return GRN
  if (['Launching', 'Updating'].includes(s) || s.startsWith('Linking')) return AMB
  if (['Aborting', 'Terminating', 'Terminated'].includes(s)) return RED
  return MU
}

/** Beanstalk environments in these states are watched every 10 seconds until they settle. */
export const ebMoving = (e: EbEnv) => ['Updating', 'Launching', 'Terminating'].includes(e.status)

export function rdsStatusColor(s: string) {
  if (s === 'available') return GRN
  if (s === 'stopped') return MU
  if (s === 'failed' || s.startsWith('incompatible')) return RED
  return AMB
}

export function cfStatusColor(s: string) {
  if (s === 'Deployed' || s === 'Completed') return GRN
  if (s === 'InProgress') return AMB
  if (s === 'Failed') return RED
  return MU
}

export function cdStatusColor(s: string) {
  if (s === 'Succeeded') return GRN
  if (s === 'Failed') return RED
  if (s === 'Stopped') return MU
  return AMB
}

export function ecStatusColor(s: string) {
  if (s === 'available') return GRN
  if (['deleting', 'incompatible-network', 'restore-failed', 'create-failed'].includes(s)) return RED
  return AMB
}

export const SH_SEV: Record<string, { label: string; color: string; rank: number }> = {
  CRITICAL: { label: 'CRIT', color: '#ff4d4f', rank: 5 },
  HIGH: { label: 'HIGH', color: '#f0883e', rank: 4 },
  MEDIUM: { label: 'MED', color: '#d4a72c', rank: 3 },
  LOW: { label: 'LOW', color: '#54aeff', rank: 2 },
  INFORMATIONAL: { label: 'INFO', color: '#8c959f', rank: 1 },
}

export const EC_SEV_COLOR: Record<string, string> = { critical: RED, important: '#f0883e', medium: AMB, low: MU }

/** How soon an ElastiCache update should be applied, coloured by how close it is. */
export function applyByLabel(ms: number, now = Date.now()) {
  if (!ms) return { text: '-', color: MU }
  const days = Math.ceil((ms - now) / 86_400_000)
  const when = days < 0 ? 'overdue' : days === 0 ? 'today' : `in ${days}d`
  return { text: `${awsDate(ms)} (${when})`, color: days < 0 ? RED : days <= 14 ? '#f0883e' : AMB }
}

/** Each word somewhere in one of the fields, ignoring case. */
export function matches(query: string, ...fields: (string | number | undefined | null)[]) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fields.filter(f => f !== undefined && f !== null).join('\n').toLowerCase()
  return words.every(w => hay.includes(w))
}

// ---------- Related resources ----------

/** A jump to another service's list, filtered to what's related. */
export interface AwsLink {
  label: string
  tab: AwsTab
  query: string
}

export function ebLinks(e: EbEnv): AwsLink[] {
  return [
    { label: `EC2 instances in ${e.env}`, tab: 'EC2', query: e.env },
    { label: `Log groups for ${e.env}`, tab: 'Logs', query: `/aws/elasticbeanstalk/${e.env}/` },
  ]
}

export function ec2Links(i: Ec2Instance): AwsLink[] {
  const env = i.tags.find(t => t.key === 'elasticbeanstalk:environment-name')?.value
  if (!env) return []
  return [
    { label: `Beanstalk environment ${env}`, tab: 'Beanstalk', query: env },
    { label: `Log groups for ${env}`, tab: 'Logs', query: `/aws/elasticbeanstalk/${env}/` },
  ]
}

export function rdsLinks(d: RdsInstance): AwsLink[] {
  return [{ label: `Log groups for ${d.id}`, tab: 'Logs', query: `/aws/rds/instance/${d.id}/` }]
}

export function logLinks(g: LogGroup): AwsLink[] {
  const eb = g.name.match(/^\/aws\/elasticbeanstalk\/([^/]+)\//)
  if (eb) return [{ label: `Beanstalk environment ${eb[1]}`, tab: 'Beanstalk', query: eb[1]! }]
  const rds = g.name.match(/^\/aws\/rds\/instance\/([^/]+)\//)
  if (rds) return [{ label: `RDS instance ${rds[1]}`, tab: 'RDS', query: rds[1]! }]
  return []
}

export function cfLinks(d: CfDistribution): AwsLink[] {
  const s3 = d.origin.match(/^(.+)\.s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com(\.cn)?$/)
  if (s3) return [{ label: `S3 bucket ${s3[1]}`, tab: 'S3', query: s3[1]! }]
  if (d.origin.endsWith('.elasticbeanstalk.com')) return [{ label: `Beanstalk environment at ${d.origin}`, tab: 'Beanstalk', query: d.origin }]
  return []
}

export function s3Links(b: S3Bucket): AwsLink[] {
  return [{ label: `CloudFront distributions in front of ${b.name}`, tab: 'CloudFront', query: `${b.name}.s3` }]
}

/** A line of output in the window: log events, console output, environment events. */
export interface AwsLine {
  /** A time or other prefix, dimmed. */
  pre?: string
  /** A short tag after it, such as a stream name or severity. */
  tag?: string
  tagColor?: string
  text: string
}
