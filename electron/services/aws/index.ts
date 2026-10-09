// The AWS window's main-process side: the combined read behind the window and the 3D World's data
// centre, the finder's search, and the AWS CLI command lines for sessions that need a terminal.
import type { AwsCtx, AwsLockState, AwsResult, AwsSearchItem, AwsWorld } from '../../../shared/aws'
import { allLogGroups } from './logs'
import { cdApps } from './audits'
import { cfDistributions, s3Buckets } from './edge'
import { ebEnvs, ec2Instances, ecResources, rdsInstances } from './compute'
import { params } from './params'
import { dryRunFrom, gateOpen, settings } from './core'
import { isEnrolled, unlockedUntil } from './totp'

export * from './core'
export * from './compute'
export * from './logs'
export * from './edge'
export * from './params'
export * from './audits'
export { enrolFinish, enrolStart, lock, unlock } from './totp'

export function lockState(): AwsLockState {
  const s = settings()
  const until = unlockedUntil()
  return { unlocked: gateOpen(), enrolled: isEnrolled(), until: s.totp ? until : 0, dryRun: !!dryRunFrom(), dryRunFrom: dryRunFrom() }
}

/** EC2 instances and Beanstalk environments together; a side that fails keeps the other. */
export async function world(ctx: AwsCtx, force: boolean): Promise<AwsWorld> {
  const [i, e] = await Promise.all([ec2Instances(ctx, force), ebEnvs(ctx, force)])
  const bad = !i.ok ? i : !e.ok ? e : null
  return {
    profile: ctx.profile,
    region: ctx.region,
    instances: i.ok ? i.data : [],
    envs: e.ok ? e.data : [],
    at: Date.now(),
    ...(bad && !bad.ok ? { error: bad.error, problem: bad.problem } : {}),
  }
}

/**
 * Everything the finder can jump to, from nine services at once (all but SecurityHub), cached
 * reads first. Services that fail are named, and the rest still come back.
 */
export async function search(ctx: AwsCtx): Promise<{ items: AwsSearchItem[]; failed: string[] }> {
  const items: AwsSearchItem[] = []
  const failed: string[] = []
  const take = async <T>(tab: AwsSearchItem['tab'], p: Promise<AwsResult<T[]>>, map: (t: T) => Omit<AwsSearchItem, 'tab'>) => {
    const r = await p
    if (!r.ok) failed.push(tab)
    else for (const x of r.data) items.push({ tab, ...map(x) })
  }
  await Promise.all([
    take('Beanstalk', ebEnvs(ctx, false), e => ({ label: e.env, detail: `${e.app} · ${e.health}`, query: e.env })),
    take('EC2', ec2Instances(ctx, false), i => ({ label: i.name || i.id, detail: `${i.id} · ${i.state}`, query: i.id })),
    take('RDS', rdsInstances(ctx, false), d => ({ label: d.id, detail: `${d.engine} · ${d.status}`, query: d.id })),
    take('ElastiCache', ecResources(ctx, false), r => ({ label: r.id, detail: `${r.engine} ${r.engineVersion} · ${r.status}`, query: r.id })),
    take('Logs', allLogGroups(ctx), g => ({ label: g.name, detail: g.retention ? `kept ${g.retention} day${g.retention === 1 ? '' : 's'}` : 'never expires', query: g.name })),
    take('CloudFront', cfDistributions(ctx, false), d => ({ label: d.domain, detail: `${d.id} · ${d.origin}`, query: d.id })),
    take('S3', s3Buckets(ctx, false), b => ({ label: b.name, detail: b.region, query: b.name })),
    take('Parameter Store', params(ctx, false), p => ({ label: p.name, detail: p.type, query: p.name })),
    take('CodeDeploy', cdApps(ctx, false), a => ({ label: a.name, detail: a.platform, query: a.name })),
  ])
  return { items, failed }
}

// ---------- AWS CLI sessions ----------

/** Refuses anything cmd.exe would read as more than a plain word. */
function safe(...vals: (string | number)[]) {
  for (const v of vals) if (/["&|<>^%!\r\n]/.test(String(v))) throw new Error(`Not a safe value for a command line: ${v}`)
}

const base = (ctx: AwsCtx) => `aws --profile ${ctx.profile} --region ${ctx.region}`

/** The command line for an interactive AWS CLI session, or an error when a value isn't safe to run. */
export function cliCommand(ctx: AwsCtx, o:
  | { kind: 'shell'; instance: string }
  | { kind: 'forward'; instance: string; remotePort: number; localPort: number; host?: string }
  | { kind: 'tail'; group: string }
  | { kind: 'login' }): { cmd: string } | { error: string } {
  try {
    safe(ctx.profile, ctx.region)
    if (o.kind === 'shell') {
      safe(o.instance)
      return { cmd: `${base(ctx)} ssm start-session --target ${o.instance} --document-name AWS-StartInteractiveCommand --parameters command=/bin/bash` }
    }
    if (o.kind === 'forward') {
      safe(o.instance, o.remotePort, o.localPort, o.host || '')
      const ports = `portNumber=${o.remotePort},localPortNumber=${o.localPort}`
      return {
        cmd: o.host
          ? `${base(ctx)} ssm start-session --target ${o.instance} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host=${o.host},${ports}`
          : `${base(ctx)} ssm start-session --target ${o.instance} --document-name AWS-StartPortForwardingSession --parameters ${ports}`,
      }
    }
    if (o.kind === 'tail') {
      safe(o.group)
      return { cmd: `${base(ctx)} logs tail --follow --format short "${o.group}"` }
    }
    return { cmd: `aws sso login --profile ${ctx.profile}` }
  } catch (e: any) {
    return { error: String(e?.message || e) }
  }
}
