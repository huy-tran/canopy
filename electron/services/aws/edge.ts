// CloudFront distributions and invalidations, and S3 buckets and objects. Each bucket is reached in
// its own region, remembered in the state shared with aws-tui.
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { CloudFrontClient, CreateInvalidationCommand, ListInvalidationsCommand, paginateListDistributions } from '@aws-sdk/client-cloudfront'
import { DeleteObjectCommand, GetBucketLocationCommand, GetObjectCommand, HeadObjectCommand, ListBucketsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import type { AwsCtx, AwsDone, CfDistribution, CfInvalidation, S3Bucket, S3Entry } from '../../../shared/aws'
import { bucketRegions, client, fetchNow, invalidate, ms, pool, read, saveBucketRegions, write } from './core'

// ---------- CloudFront (global, so its cache keys carry no region) ----------

export function cfDistributions(ctx: AwsCtx, force: boolean) {
  return read<CfDistribution[]>(ctx, 'cloudfront:distributions', 60_000, force, async () => {
    const out: CfDistribution[] = []
    for await (const page of paginateListDistributions({ client: client(CloudFrontClient, ctx, 'us-east-1') }, {})) {
      for (const d of page.DistributionList?.Items || []) {
        out.push({ id: d.Id || '', domain: d.DomainName || '', origin: d.Origins?.Items?.[0]?.DomainName || '', status: d.Status || '', enabled: !!d.Enabled, aliases: d.Aliases?.Items || [] })
      }
    }
    return out
  })
}

export function cfInvalidations(ctx: AwsCtx, dist: string, force: boolean) {
  return read<CfInvalidation[]>(ctx, `cloudfront:invalidations:${dist}`, 30_000, force, async () => {
    const r = await client(CloudFrontClient, ctx, 'us-east-1').send(new ListInvalidationsCommand({ DistributionId: dist }))
    return (r.InvalidationList?.Items || []).map(i => ({ id: i.Id || '', status: i.Status || '', createdAt: ms(i.CreateTime) }))
  })
}

export function cfInvalidate(ctx: AwsCtx, dist: string, paths: string[]) {
  return write(ctx, 'cloudfront:CreateInvalidation', dist, { paths }, async () => {
    const r = await client(CloudFrontClient, ctx, 'us-east-1').send(new CreateInvalidationCommand({
      DistributionId: dist,
      InvalidationBatch: { CallerReference: `aws-tui-${Math.floor(Date.now() / 1000)}`, Paths: { Quantity: paths.length, Items: paths } },
    }))
    invalidate(ctx, `cloudfront:invalidations:${dist}`)
    return r.Invalidation?.Id || ''
  })
}

// ---------- S3 ----------

/** Buckets, with each one's region: remembered ones straight away, the rest looked up ten at a time. */
export function s3Buckets(ctx: AwsCtx, force: boolean) {
  return read<S3Bucket[]>(ctx, 's3:buckets', 5 * 60_000, force, async () => {
    const r = await client(S3Client, ctx).send(new ListBucketsCommand({}))
    const known = bucketRegions()
    const list = (r.Buckets || []).map(b => ({ name: b.Name || '', region: known[b.Name || ''] || '', createdAt: ms(b.CreationDate) }))
    const found: Record<string, string> = {}
    await pool(list.filter(b => !b.region), 10, async (b) => {
      try {
        const loc = await client(S3Client, ctx, 'us-east-1').send(new GetBucketLocationCommand({ Bucket: b.name }))
        // An empty location means us-east-1; EU is the old name for eu-west-1.
        b.region = !loc.LocationConstraint ? 'us-east-1' : loc.LocationConstraint === 'EU' ? 'eu-west-1' : loc.LocationConstraint
        found[b.name] = b.region
      } catch {
        b.region = ''
      }
    })
    saveBucketRegions(found)
    return list.sort((a, b) => a.name.localeCompare(b.name))
  })
}

const s3For = (ctx: AwsCtx, region: string) => client(S3Client, ctx, region || ctx.region)

/** The folders and files directly under a prefix, the first thousand. */
export function s3List(ctx: AwsCtx, bucket: string, region: string, prefix: string, force: boolean) {
  return read<{ entries: S3Entry[]; truncated: boolean }>(ctx, `s3:objects:${bucket}:${prefix}`, 30_000, force, async () => {
    const r = await s3For(ctx, region).send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix || undefined, Delimiter: '/', MaxKeys: 1000 }))
    const folders = (r.CommonPrefixes || []).map(p => ({ key: p.Prefix || '', folder: true, size: 0, modifiedAt: 0 }))
    const files = (r.Contents || []).filter(o => o.Key !== prefix).map(o => ({ key: o.Key || '', folder: false, size: o.Size || 0, modifiedAt: ms(o.LastModified) }))
    return { entries: [...folders, ...files], truncated: !!r.IsTruncated }
  })
}

export function s3Download(ctx: AwsCtx, bucket: string, region: string, key: string, dest: string) {
  return fetchNow(ctx, async () => {
    const r = await s3For(ctx, region).send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await pipeline(r.Body as Readable, fs.createWriteStream(dest))
    return dest
  })
}

/** Deletes objects, eight at a time; each is in the audit log, and dry-run only logs them. */
export async function s3Delete(ctx: AwsCtx, bucket: string, region: string, keys: string[]): Promise<AwsDone> {
  const results = await pool(keys, 8, key => write(ctx, 's3:DeleteObject', `s3://${bucket}/${key}`, undefined, async () => {
    await s3For(ctx, region).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  }))
  invalidate(ctx, `s3:objects:${bucket}:`)
  const bad = results.filter(r => !r.ok)
  if (bad.length) return { ok: false, error: `${bad.length} of ${keys.length} not deleted: ${bad[0]!.error}`, problem: bad[0]!.problem }
  return { ok: true, dryRun: results.some(r => r.dryRun) }
}

/** Which of these keys already exist, for the overwrite question before an upload. */
export function s3Existing(ctx: AwsCtx, bucket: string, region: string, keys: string[]) {
  return fetchNow(ctx, async () => {
    const hits = await pool(keys, 8, async (key) => {
      try {
        await s3For(ctx, region).send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return key
      } catch {
        return ''
      }
    })
    return hits.filter(Boolean)
  })
}

/** Uploads one file (in parts when it is large). */
export function s3Upload(ctx: AwsCtx, bucket: string, region: string, file: string, key: string) {
  const size = (() => {
    try {
      return fs.statSync(file).size
    } catch {
      return 0
    }
  })()
  return write(ctx, 's3:PutObject', `s3://${bucket}/${key}`, { bytes: size }, async () => {
    await new Upload({ client: s3For(ctx, region), params: { Bucket: bucket, Key: key, Body: fs.createReadStream(file) } }).done()
    invalidate(ctx, `s3:objects:${bucket}:`)
  })
}

/** Local files' sizes, for the upload queue. */
export function fileSizes(files: string[]) {
  return files.map((f) => {
    try {
      return fs.statSync(f).size
    } catch {
      return 0
    }
  })
}
