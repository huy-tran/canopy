// SecurityHub insights and findings, and CodeDeploy applications, groups and deployments. Both read-only.
import { GetInsightResultsCommand, SecurityHubClient, paginateGetFindings, paginateGetInsights, type AwsSecurityFindingFilters, type StringFilter } from '@aws-sdk/client-securityhub'
import { BatchGetApplicationsCommand, BatchGetDeploymentGroupsCommand, BatchGetDeploymentsCommand, CodeDeployClient, ListDeploymentsCommand, paginateListApplications, paginateListDeploymentGroups } from '@aws-sdk/client-codedeploy'
import type { AwsCtx, AwsResult, CdApp, CdDeployment, CdGroup, ShFinding, ShFindingsQuery, ShInsight, ShInsightResult } from '../../../shared/aws'
import { client, fetchNow, ms, read } from './core'

// ---------- SecurityHub ----------

const NOT_ENABLED = (ctx: AwsCtx) => `SecurityHub may not be enabled in ${ctx.region}. To turn it on, run: aws securityhub enable-security-hub --region ${ctx.region} --profile ${ctx.profile}`

/** SecurityHub says "not subscribed" with an access error: put it in words that help. */
function explain<T>(ctx: AwsCtx, r: AwsResult<T>): AwsResult<T> {
  if (!r.ok && /InvalidAccessException|not subscribed/i.test(r.error)) return { ok: false, error: NOT_ENABLED(ctx), problem: 'other' }
  return r
}

/** "ResourceId" -> "Resource", as aws-tui labels an insight's grouping. */
function groupLabel(g: string) {
  if (g.startsWith('ResourceId')) return 'Resource'
  if (g.startsWith('Severity')) return 'Severity'
  if (g.startsWith('AwsAccountId')) return 'Account'
  if (g.startsWith('ProductName')) return 'Product'
  if (g.startsWith('UserName') || g.includes('Principal') || g.includes('IamUser')) return 'Principal'
  if (g.startsWith('Type')) return 'Type'
  return g
}

export async function shInsights(ctx: AwsCtx, force: boolean) {
  return explain(ctx, await read<ShInsight[]>(ctx, `sh:insights:${ctx.region}`, 10 * 60_000, force, async () => {
    const out: ShInsight[] = []
    for await (const page of paginateGetInsights({ client: client(SecurityHubClient, ctx) }, { MaxResults: 100 })) {
      for (const i of page.Insights || []) {
        const arn = i.InsightArn || ''
        out.push({ arn, name: i.Name || '', groupBy: groupLabel(i.GroupByAttribute || ''), attr: i.GroupByAttribute || '', owner: arn.split(':')[4] === '' ? 'AWS' : 'You' })
      }
    }
    // The account's own insights first.
    return out.sort((a, b) => Number(a.owner === 'AWS') - Number(b.owner === 'AWS') || a.name.localeCompare(b.name))
  }))
}

export async function shInsightResults(ctx: AwsCtx, arn: string) {
  return explain(ctx, await fetchNow<ShInsightResult[]>(ctx, async () => {
    const r = await client(SecurityHubClient, ctx).send(new GetInsightResultsCommand({ InsightArn: arn }))
    return (r.InsightResults?.ResultValues || []).map(v => ({ value: v.GroupByAttributeValue || '', count: v.Count || 0 }))
      .sort((a, b) => b.count - a.count).slice(0, 50)
  }))
}

const SEV_RANK: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFORMATIONAL: 1 }
const MAX_FINDINGS = 500

/** Active findings, for an insight's group or all of them; at most 500, worst and newest first. */
export async function shFindings(ctx: AwsCtx, q: ShFindingsQuery) {
  return explain(ctx, await fetchNow<{ findings: ShFinding[]; capped: boolean }>(ctx, async () => {
    const f: AwsSecurityFindingFilters = { RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }] }
    if (q.group) {
      const eq: StringFilter[] = [{ Value: q.group.value, Comparison: 'EQUALS' }]
      const key = ({ Resource: 'ResourceId', Account: 'AwsAccountId', Product: 'ProductName', Severity: 'SeverityLabel', Principal: 'ResourceAwsIamUserUserName', Type: 'Type' } as const)[groupLabel(q.group.attr) as 'Resource']
      if (key) (f as Record<string, StringFilter[]>)[key] = eq
    }
    const out: ShFinding[] = []
    let capped = false
    for await (const page of paginateGetFindings({ client: client(SecurityHubClient, ctx) }, { Filters: f, MaxResults: 100 })) {
      for (const x of page.Findings || []) {
        out.push({
          id: x.Id || '',
          title: x.Title || '',
          description: x.Description || '',
          severity: x.Severity?.Label || '',
          workflow: x.Workflow?.Status || '',
          recordState: x.RecordState || '',
          product: x.ProductName || '',
          account: x.AwsAccountId || '',
          region: x.Region || '',
          updatedAt: ms(x.UpdatedAt),
          resources: (x.Resources || []).map(r => ({ arn: r.Id || '', type: r.Type || '' })),
          compliance: x.Compliance?.Status || '',
          standards: (x.Compliance?.AssociatedStandards || []).map(s => s.StandardsId || '').join(', '),
          remediation: { text: x.Remediation?.Recommendation?.Text || '', url: x.Remediation?.Recommendation?.Url || '' },
        })
      }
      if (out.length >= MAX_FINDINGS) {
        capped = true
        break
      }
    }
    out.sort((a, b) => (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0) || b.updatedAt - a.updatedAt)
    return { findings: out.slice(0, MAX_FINDINGS), capped }
  }))
}

// ---------- CodeDeploy ----------

const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

export function cdApps(ctx: AwsCtx, force: boolean) {
  return read<CdApp[]>(ctx, `codedeploy:apps:${ctx.region}`, 5 * 60_000, force, async () => {
    const c = client(CodeDeployClient, ctx)
    const names: string[] = []
    for await (const page of paginateListApplications({ client: c }, {})) names.push(...(page.applications || []))
    const out: CdApp[] = []
    for (const part of chunks(names, 100)) {
      const r = await c.send(new BatchGetApplicationsCommand({ applicationNames: part }))
      for (const a of r.applicationsInfo || []) out.push({ name: a.applicationName || '', platform: a.computePlatform || '', createdAt: ms(a.createTime) })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  })
}

export function cdGroups(ctx: AwsCtx, app: string, force: boolean) {
  return read<CdGroup[]>(ctx, `codedeploy:groups:${ctx.region}:${app}`, 2 * 60_000, force, async () => {
    const c = client(CodeDeployClient, ctx)
    const names: string[] = []
    for await (const page of paginateListDeploymentGroups({ client: c }, { applicationName: app })) names.push(...(page.deploymentGroups || []))
    const out: CdGroup[] = []
    for (const part of chunks(names, 100)) {
      const r = await c.send(new BatchGetDeploymentGroupsCommand({ applicationName: app, deploymentGroupNames: part }))
      for (const g of r.deploymentGroupsInfo || []) {
        const last = g.lastAttemptedDeployment?.status ? g.lastAttemptedDeployment : g.lastSuccessfulDeployment
        out.push({
          name: g.deploymentGroupName || '', platform: g.computePlatform || '', config: g.deploymentConfigName || '',
          lastStatus: last?.status || '', lastAt: ms(last?.createTime || last?.endTime), serviceRole: g.serviceRoleArn || '',
        })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  })
}

export function cdDeployments(ctx: AwsCtx, app: string, group: string, force: boolean) {
  return read<CdDeployment[]>(ctx, `codedeploy:deployments:${ctx.region}:${app}:${group}`, 30_000, force, async () => {
    const c = client(CodeDeployClient, ctx)
    const ids = (await c.send(new ListDeploymentsCommand({ applicationName: app, deploymentGroupName: group }))).deployments || []
    const out: CdDeployment[] = []
    for (const part of chunks(ids, 25)) {
      const r = await c.send(new BatchGetDeploymentsCommand({ deploymentIds: part }))
      for (const d of r.deploymentsInfo || []) {
        const rev = d.revision
        const revision = rev?.s3Location ? `s3://${rev.s3Location.bucket}/${rev.s3Location.key}` : rev?.gitHubLocation ? `github:${rev.gitHubLocation.repository}@${rev.gitHubLocation.commitId}` : ''
        const o = d.deploymentOverview
        out.push({
          id: d.deploymentId || '', status: d.status || '', creator: d.creator || '', createdAt: ms(d.createTime), completedAt: ms(d.completeTime),
          app: d.applicationName || app, group: d.deploymentGroupName || group, config: d.deploymentConfigName || '', description: d.description || '',
          revision, errCode: d.errorInformation?.code || '', errMessage: d.errorInformation?.message || '',
          succeeded: o?.Succeeded || 0, failed: o?.Failed || 0, inProgress: o?.InProgress || 0, pending: o?.Pending || 0, skipped: o?.Skipped || 0,
        })
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  })
}
