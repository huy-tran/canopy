// EC2, Elastic Beanstalk, RDS and ElastiCache, with aws-tui's cache lifetimes.
import { DescribeRegionsCommand, EC2Client, GetConsoleOutputCommand, RebootInstancesCommand, StartInstancesCommand, StopInstancesCommand, paginateDescribeInstances } from '@aws-sdk/client-ec2'
import { DescribeApplicationVersionsCommand, DescribeEnvironmentsCommand, DescribeEventsCommand, ElasticBeanstalkClient, UpdateEnvironmentCommand } from '@aws-sdk/client-elastic-beanstalk'
import { RDSClient, paginateDescribeDBInstances } from '@aws-sdk/client-rds'
import { BatchApplyUpdateActionCommand, DescribeServiceUpdatesCommand, ElastiCacheClient, paginateDescribeCacheClusters, paginateDescribeReplicationGroups, paginateDescribeUpdateActions } from '@aws-sdk/client-elasticache'
import type { AwsCtx, AwsRegionStatus, EbEnv, EbEvent, EbVersion, EcResource, EcServiceUpdate, EcUpdateAction, Ec2Instance, RdsInstance } from '../../../shared/aws'
import { client, fetchNow, invalidate, ms, read, write } from './core'

const S = 1000, M = 60 * S

// ---------- Regions ----------

/** Which regions the account can use: opt-in regions it hasn't opted into are marked. */
export function regions(ctx: AwsCtx) {
  return read<AwsRegionStatus[]>(ctx, 'ec2:opt-in-regions', 30 * M, false, async () => {
    const r = await client(EC2Client, ctx).send(new DescribeRegionsCommand({ AllRegions: true }))
    return (r.Regions || []).map(x => ({ name: x.RegionName || '', status: x.OptInStatus || '' }))
  })
}

// ---------- EC2 ----------

export function ec2Instances(ctx: AwsCtx, force: boolean) {
  return read<Ec2Instance[]>(ctx, `ec2:instances:${ctx.region}`, 60 * S, force, async () => {
    const out: Ec2Instance[] = []
    for await (const page of paginateDescribeInstances({ client: client(EC2Client, ctx) }, {})) {
      for (const res of page.Reservations || []) {
        for (const i of res.Instances || []) {
          const tags = (i.Tags || []).map(t => ({ key: t.Key || '', value: t.Value || '' })).sort((a, b) => a.key.localeCompare(b.key))
          out.push({
            id: i.InstanceId || '',
            name: tags.find(t => t.key === 'Name')?.value || '',
            state: i.State?.Name || '',
            type: i.InstanceType || '',
            privIp: i.PrivateIpAddress || '',
            pubIp: i.PublicIpAddress || '',
            pubDns: i.PublicDnsName || '',
            vpc: i.VpcId || '',
            subnet: i.SubnetId || '',
            az: i.Placement?.AvailabilityZone || '',
            platform: i.Platform ? 'windows' : 'linux',
            ami: i.ImageId || '',
            iamRole: (i.IamInstanceProfile?.Arn || '').split('/').pop() || '',
            launchedAt: ms(i.LaunchTime),
            securityGroups: (i.SecurityGroups || []).map(g => `${g.GroupName} (${g.GroupId})`),
            tags,
          })
        }
      }
    }
    // Named instances first, then by name, then by id.
    return out.sort((a, b) => Number(!a.name) - Number(!b.name) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
  })
}

export function ec2Console(ctx: AwsCtx, id: string, latest: boolean) {
  return fetchNow(ctx, async () => {
    const r = await client(EC2Client, ctx).send(new GetConsoleOutputCommand({ InstanceId: id, Latest: latest || undefined }))
    return r.Output ? Buffer.from(r.Output, 'base64').toString('utf8') : ''
  })
}

export function ec2Power(ctx: AwsCtx, id: string, what: 'stop' | 'start' | 'reboot', name: string, stateBefore: string) {
  const action = { stop: 'ec2:StopInstances', start: 'ec2:StartInstances', reboot: 'ec2:RebootInstances' }[what]
  return write(ctx, action, id, { name, state_before: stateBefore }, async () => {
    const c = client(EC2Client, ctx)
    if (what === 'stop') await c.send(new StopInstancesCommand({ InstanceIds: [id] }))
    else if (what === 'start') await c.send(new StartInstancesCommand({ InstanceIds: [id] }))
    else await c.send(new RebootInstancesCommand({ InstanceIds: [id] }))
    invalidate(ctx, `ec2:instances:${ctx.region}`)
  })
}

// ---------- Beanstalk ----------

export function ebEnvs(ctx: AwsCtx, force: boolean) {
  return read<EbEnv[]>(ctx, `eb:environments:${ctx.region}`, 60 * S, force, async () => {
    const r = await client(ElasticBeanstalkClient, ctx).send(new DescribeEnvironmentsCommand({ IncludeDeleted: false }))
    return (r.Environments || []).map(e => ({
      app: e.ApplicationName || '',
      env: e.EnvironmentName || '',
      id: e.EnvironmentId || '',
      cname: e.CNAME || '',
      status: e.Status || '',
      health: e.Health || '',
      version: e.VersionLabel || '',
      platform: e.PlatformArn || e.SolutionStackName || '',
      tier: e.Tier?.Name || '',
      updatedAt: ms(e.DateUpdated),
    })).sort((a, b) => a.app.localeCompare(b.app) || a.env.localeCompare(b.env))
  })
}

export function ebEvents(ctx: AwsCtx, env: string) {
  return fetchNow<EbEvent[]>(ctx, async () => {
    const r = await client(ElasticBeanstalkClient, ctx).send(new DescribeEventsCommand({ EnvironmentName: env, MaxRecords: 50 }))
    return (r.Events || []).map(e => ({ at: ms(e.EventDate), severity: e.Severity || '', message: e.Message || '' }))
  })
}

export function ebVersions(ctx: AwsCtx, app: string, force: boolean) {
  return read<EbVersion[]>(ctx, `eb:versions:${ctx.region}:${app}`, 5 * M, force, async () => {
    const r = await client(ElasticBeanstalkClient, ctx).send(new DescribeApplicationVersionsCommand({ ApplicationName: app }))
    return (r.ApplicationVersions || []).map(v => ({ label: v.VersionLabel || '', description: v.Description || '', createdAt: ms(v.DateCreated), status: v.Status || '' }))
      .sort((a, b) => b.createdAt - a.createdAt)
  })
}

export function ebDeploy(ctx: AwsCtx, env: string, version: string) {
  return write(ctx, 'elasticbeanstalk:UpdateEnvironment', env, { version }, async () => {
    await client(ElasticBeanstalkClient, ctx).send(new UpdateEnvironmentCommand({ EnvironmentName: env, VersionLabel: version }))
    invalidate(ctx, `eb:environments:${ctx.region}`)
  })
}

// ---------- RDS ----------

export function rdsInstances(ctx: AwsCtx, force: boolean) {
  return read<RdsInstance[]>(ctx, `rds:instances:${ctx.region}`, 60 * S, force, async () => {
    const out: RdsInstance[] = []
    for await (const page of paginateDescribeDBInstances({ client: client(RDSClient, ctx) }, {})) {
      for (const d of page.DBInstances || []) {
        out.push({
          id: d.DBInstanceIdentifier || '',
          engine: d.Engine || '',
          engineVersion: d.EngineVersion || '',
          status: d.DBInstanceStatus || '',
          endpoint: d.Endpoint?.Address || '',
          port: d.Endpoint?.Port || 0,
          class: d.DBInstanceClass || '',
          multiAz: !!d.MultiAZ,
          dbName: d.DBName || '',
          masterUser: d.MasterUsername || '',
          vpc: d.DBSubnetGroup?.VpcId || '',
          subnetGroup: d.DBSubnetGroup?.DBSubnetGroupName || '',
          securityGroups: (d.VpcSecurityGroups || []).map(g => g.VpcSecurityGroupId || ''),
          allocatedGb: d.AllocatedStorage || 0,
          storageType: d.StorageType || '',
          iops: d.Iops || 0,
          createdAt: ms(d.InstanceCreateTime),
        })
      }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  })
}

// ---------- ElastiCache ----------

/** Replication groups and the clusters outside any group; a group's members fold into it. */
export function ecResources(ctx: AwsCtx, force: boolean) {
  return read<EcResource[]>(ctx, `elasticache:resources:${ctx.region}`, 60 * S, force, async () => {
    const c = client(ElastiCacheClient, ctx)
    const version: Record<string, string> = {}
    const out: EcResource[] = []
    for await (const page of paginateDescribeCacheClusters({ client: c }, { ShowCacheNodeInfo: true })) {
      for (const cc of page.CacheClusters || []) {
        const id = cc.CacheClusterId || ''
        version[id] = cc.EngineVersion || ''
        if (cc.ReplicationGroupId) continue
        const ep = cc.ConfigurationEndpoint || cc.CacheNodes?.[0]?.Endpoint
        out.push({
          id, kind: 'cache-cluster', engine: cc.Engine || '', engineVersion: cc.EngineVersion || '', nodeType: cc.CacheNodeType || '',
          status: cc.CacheClusterStatus || '', description: '', endpoint: ep?.Address || '', port: ep?.Port || 0,
          nodes: cc.NumCacheNodes || 0, shards: 0, clusterMode: '', multiAz: '', autoFailover: '', members: [],
        })
      }
    }
    for await (const page of paginateDescribeReplicationGroups({ client: c }, {})) {
      for (const g of page.ReplicationGroups || []) {
        const members = g.MemberClusters || []
        const ep = g.ConfigurationEndpoint || g.NodeGroups?.[0]?.PrimaryEndpoint
        out.push({
          id: g.ReplicationGroupId || '', kind: 'replication-group', engine: g.Engine || 'redis', engineVersion: version[members[0] || ''] || '',
          nodeType: g.CacheNodeType || '', status: g.Status || '', description: g.Description || '', endpoint: ep?.Address || '', port: ep?.Port || 0,
          nodes: members.length, shards: g.NodeGroups?.length || 0, clusterMode: g.ClusterEnabled ? 'enabled' : 'disabled',
          multiAz: g.MultiAZ || '', autoFailover: g.AutomaticFailover || '', members,
        })
      }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  })
}

const applicable = (u: EcUpdateAction) => u.status === 'not-applied' || u.status === 'stopped'
const inFlight = (u: EcUpdateAction) => ['waiting-to-start', 'in-progress', 'stopping', 'scheduling', 'scheduled'].includes(u.status)
const withdrawn = (u: EcUpdateAction) => u.serviceUpdateStatus === 'cancelled' || u.serviceUpdateStatus === 'expired'

/** Applicable first, then in flight, then done, then withdrawn; soonest apply-by first within each. */
function band(u: EcUpdateAction) {
  if (withdrawn(u)) return 3
  if (applicable(u)) return 0
  if (inFlight(u)) return 1
  return 2
}

export function ecUpdates(ctx: AwsCtx, force: boolean) {
  return read<EcUpdateAction[]>(ctx, `elasticache:updates:${ctx.region}`, 60 * S, force, async () => {
    const out: EcUpdateAction[] = []
    for await (const page of paginateDescribeUpdateActions({ client: client(ElastiCacheClient, ctx) }, { ShowNodeLevelUpdateStatus: true })) {
      for (const ua of page.UpdateActions || []) {
        const nodes: EcUpdateAction['nodes'] = []
        for (const ng of ua.NodeGroupUpdateStatus || []) {
          for (const m of ng.NodeGroupMemberUpdateStatus || []) {
            nodes.push({ node: `${m.CacheClusterId}/${m.CacheNodeId}`, status: m.NodeUpdateStatus || '', startedAt: ms(m.NodeUpdateStartDate), endedAt: ms(m.NodeUpdateEndDate) })
          }
        }
        for (const n of ua.CacheNodeUpdateStatus || []) {
          nodes.push({ node: `${ua.CacheClusterId}/${n.CacheNodeId}`, status: n.NodeUpdateStatus || '', startedAt: ms(n.NodeUpdateStartDate), endedAt: ms(n.NodeUpdateEndDate) })
        }
        out.push({
          serviceUpdate: ua.ServiceUpdateName || '',
          resource: ua.ReplicationGroupId || ua.CacheClusterId || '',
          resourceKind: ua.ReplicationGroupId ? 'replication-group' : 'cache-cluster',
          engine: ua.Engine || '',
          severity: ua.ServiceUpdateSeverity || '',
          type: ua.ServiceUpdateType || '',
          serviceUpdateStatus: ua.ServiceUpdateStatus || '',
          status: ua.UpdateActionStatus || '',
          releasedAt: ms(ua.ServiceUpdateReleaseDate),
          applyBy: ms(ua.ServiceUpdateRecommendedApplyByDate),
          availableAt: ms(ua.UpdateActionAvailableDate),
          statusChangedAt: ms(ua.UpdateActionStatusModifiedDate),
          nodesUpdated: ua.NodesUpdated || '',
          estimatedTime: ua.EstimatedUpdateTime || '',
          slaMet: ua.SlaMet || '',
          nodes,
        })
      }
    }
    return out.sort((a, b) => band(a) - band(b) || (a.applyBy || Infinity) - (b.applyBy || Infinity) || a.resource.localeCompare(b.resource) || a.serviceUpdate.localeCompare(b.serviceUpdate))
  })
}

export function ecServiceUpdate(ctx: AwsCtx, name: string, force: boolean) {
  return read<EcServiceUpdate | null>(ctx, `elasticache:service-update:${ctx.region}:${name}`, 10 * M, force, async () => {
    const r = await client(ElastiCacheClient, ctx).send(new DescribeServiceUpdatesCommand({ ServiceUpdateName: name }))
    const u = r.ServiceUpdates?.[0]
    if (!u) return null
    return {
      name: u.ServiceUpdateName || '', description: u.ServiceUpdateDescription || '', engine: u.Engine || '', engineVersion: u.EngineVersion || '',
      severity: u.ServiceUpdateSeverity || '', type: u.ServiceUpdateType || '', status: u.ServiceUpdateStatus || '',
      releasedAt: ms(u.ServiceUpdateReleaseDate), endsAt: ms(u.ServiceUpdateEndDate), applyBy: ms(u.ServiceUpdateRecommendedApplyByDate),
      estimatedTime: u.EstimatedUpdateTime || '', autoUpdate: !!u.AutoUpdateAfterRecommendedApplyByDate,
    }
  })
}

export function ecApply(ctx: AwsCtx, update: string, resource: string, kind: EcUpdateAction['resourceKind'], severity: string) {
  return write(ctx, 'elasticache:BatchApplyUpdateAction', resource, { service_update: update, kind, severity }, async () => {
    const r = await client(ElastiCacheClient, ctx).send(new BatchApplyUpdateActionCommand({
      ServiceUpdateName: update,
      ...(kind === 'replication-group' ? { ReplicationGroupIds: [resource] } : { CacheClusterIds: [resource] }),
    }))
    const bad = r.UnprocessedUpdateActions?.[0]
    invalidate(ctx, `elasticache:updates:${ctx.region}`)
    if (bad) throw new Error(`${bad.ErrorType || 'Not applied'}: ${bad.ErrorMessage || ''}`.trim())
  })
}
