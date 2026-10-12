// The AWS window's calls: one `aws:<name>` channel each.
import { app, dialog } from 'electron'
import path from 'node:path'
import type { AwsCtx } from '../../shared/aws'
import { AWS_CALLS, type AwsApi } from '../../shared/bridge'
import { awsCache, handle, prefs, ptyData, send, state } from '../context'
import * as aws from '../services/aws'
import { spawnCommand } from '../services/pty'

/** Files picked in the upload dialog: the only local files an S3 upload will read. */
const pickedUploads = new Set<string>()

aws.configureAws(() => {
  const p = prefs()
  return { totp: p?.awsTotp !== false, ttlHours: p?.awsUnlockHours || 4, dryRun: !!p?.awsDryRun }
})

/** One `aws:<name>` channel per call in AWS_CALLS. */
export function registerAwsIpc() {
  const calls: { [K in (typeof AWS_CALLS)[number]]: (...a: any[]) => ReturnType<AwsApi[K]> | Awaited<ReturnType<AwsApi[K]>> } = {
    lockState: () => aws.lockState(),
    unlock: (code: string) => aws.unlock(code, aws.settings().ttlHours),
    lock: () => aws.lock(),
    enrolStart: () => aws.enrolStart(),
    enrolFinish: (code: string) => aws.enrolFinish(code, aws.settings().ttlHours),
    profiles: () => aws.listProfiles(),
    state: () => aws.loadState(),
    remember: (profile: string, region: string) => aws.rememberProfile(profile, region),
    saveBookmarks: (profile, list) => aws.saveBookmarks(profile, list),
    forget: (profile: string) => aws.forgetProfile(profile),
    regions: (ctx: AwsCtx) => aws.regions(ctx),
    world: async (ctx: AwsCtx, force: boolean) => {
      const w = await aws.world(ctx, force)
      if (!w.error) awsCache.set('world', w)
      return w
    },
    cachedWorld: () => awsCache.get('world') ?? null,
    search: (ctx: AwsCtx) => aws.search(ctx),
    term: (ctx: AwsCtx, id: string, o: any, cols: number, rows: number) => {
      if (!aws.gateOpen()) return { ok: false, error: 'AWS is locked.' }
      const c = aws.cliCommand(ctx, o)
      if ('error' in c) return { ok: false, error: c.error }
      spawnCommand({ id, cmd: c.cmd, cols, rows }, ptyData, (i, code) => send('pty:exit', i, code))
      return { ok: true, cmd: c.cmd }
    },
    ec2Instances: (ctx, force) => aws.ec2Instances(ctx, force),
    ec2Console: (ctx, id, latest) => aws.ec2Console(ctx, id, latest),
    ec2Power: (ctx, id, what, name, before) => aws.ec2Power(ctx, id, what, name, before),
    ebEnvs: (ctx, force) => aws.ebEnvs(ctx, force),
    ebEvents: (ctx, env) => aws.ebEvents(ctx, env),
    ebVersions: (ctx, app, force) => aws.ebVersions(ctx, app, force),
    ebDeploy: (ctx, env, version) => aws.ebDeploy(ctx, env, version),
    rdsInstances: (ctx, force) => aws.rdsInstances(ctx, force),
    ecResources: (ctx, force) => aws.ecResources(ctx, force),
    ecUpdates: (ctx, force) => aws.ecUpdates(ctx, force),
    ecServiceUpdate: (ctx, name, force) => aws.ecServiceUpdate(ctx, name, force),
    ecApply: (ctx, update, resource, kind, severity) => aws.ecApply(ctx, update, resource, kind, severity),
    logGroups: (ctx, token, force) => aws.logGroups(ctx, token, force),
    logStreams: (ctx, group, force) => aws.logStreams(ctx, group, force),
    logEvents: (ctx, group, stream) => aws.logEvents(ctx, group, stream),
    logSearch: (ctx, group, pattern, start, end) => aws.logSearch(ctx, group, pattern, start, end),
    tailStart: (ctx, id, arn) => aws.tailStart(ctx, id, arn, m => send('aws:tail', m)),
    tailStop: (id: string) => aws.tailStop(id),
    cfDistributions: (ctx, force) => aws.cfDistributions(ctx, force),
    cfInvalidations: (ctx, dist, force) => aws.cfInvalidations(ctx, dist, force),
    cfInvalidate: (ctx, dist, paths) => aws.cfInvalidate(ctx, dist, paths),
    s3Buckets: (ctx, force) => aws.s3Buckets(ctx, force),
    s3List: (ctx, bucket, region, prefix, force) => aws.s3List(ctx, bucket, region, prefix, force),
    s3Download: async (ctx: AwsCtx, bucket: string, region: string, key: string) => {
      const r = await dialog.showSaveDialog(state.win!, { defaultPath: path.join(app.getPath('downloads'), path.basename(key)) })
      if (r.canceled || !r.filePath) return { ok: true as const, data: null }
      return aws.s3Download(ctx, bucket, region, key, r.filePath)
    },
    s3Delete: (ctx, bucket, region, keys) => aws.s3Delete(ctx, bucket, region, keys),
    s3PickUpload: async () => {
      const r = await dialog.showOpenDialog(state.win!, { properties: ['openFile', 'multiSelections'] })
      if (r.canceled) return []
      for (const p of r.filePaths) pickedUploads.add(p)
      const sizes = aws.fileSizes(r.filePaths)
      return r.filePaths.map((p, i) => ({ path: p, size: sizes[i] || 0 }))
    },
    s3Existing: (ctx, bucket, region, keys) => aws.s3Existing(ctx, bucket, region, keys),
    s3Upload: async (ctx, bucket, region, file, key) => {
      if (!pickedUploads.has(file)) return { ok: false as const, error: 'Pick the file in the upload dialog first.', problem: 'other' as const }
      const r = await aws.s3Upload(ctx, bucket, region, file, key)
      if (r.ok) pickedUploads.delete(file)
      return r
    },
    params: (ctx, force) => aws.params(ctx, force),
    paramValue: (ctx, meta, version) => aws.paramValue(ctx, meta, version),
    paramHistory: (ctx, name) => aws.paramHistory(ctx, name),
    paramPut: (ctx, o) => aws.paramPut(ctx, o),
    shInsights: (ctx, force) => aws.shInsights(ctx, force),
    shInsightResults: (ctx, arn) => aws.shInsightResults(ctx, arn),
    shFindings: (ctx, q) => aws.shFindings(ctx, q),
    cdApps: (ctx, force) => aws.cdApps(ctx, force),
    cdGroups: (ctx, appName, force) => aws.cdGroups(ctx, appName, force),
    cdDeployments: (ctx, appName, group, force) => aws.cdDeployments(ctx, appName, group, force),
  }
  for (const name of AWS_CALLS) handle(`aws:${name}`, calls[name])
}
