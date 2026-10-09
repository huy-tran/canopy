// Parameter Store: names and metadata are cached, values never are.
import { GetParameterCommand, GetParameterHistoryCommand, PutParameterCommand, SSMClient, paginateDescribeParameters, type ParameterType } from '@aws-sdk/client-ssm'
import type { AwsCtx, SsmParam, SsmParamValue, SsmParamVersion } from '../../../shared/aws'
import { client, fetchNow, invalidate, ms, read, write } from './core'

/** "arn:aws:iam::123:user/huy" -> "huy"; the last part of whoever changed it. */
const who = (arn: string) => (arn || '').split(/[:/]/).pop() || ''

export function params(ctx: AwsCtx, force: boolean) {
  return read<SsmParam[]>(ctx, `ssm:params:${ctx.region}`, 60_000, force, async () => {
    const out: SsmParam[] = []
    for await (const page of paginateDescribeParameters({ client: client(SSMClient, ctx) }, { MaxResults: 50 })) {
      for (const p of page.Parameters || []) {
        out.push({
          name: p.Name || '', type: p.Type || '', version: p.Version || 0, modifiedAt: ms(p.LastModifiedDate),
          modifiedBy: who(p.LastModifiedUser || ''), description: p.Description || '', keyId: p.KeyId || '',
        })
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  })
}

/** A parameter's value, decrypted, at a version or the latest. */
export function paramValue(ctx: AwsCtx, meta: SsmParam, version?: number) {
  return fetchNow<SsmParamValue>(ctx, async () => {
    const r = await client(SSMClient, ctx).send(new GetParameterCommand({ Name: version ? `${meta.name}:${version}` : meta.name, WithDecryption: true }))
    const p = r.Parameter
    return { ...meta, type: p?.Type || meta.type, version: p?.Version || meta.version, modifiedAt: ms(p?.LastModifiedDate) || meta.modifiedAt, value: p?.Value || '' }
  })
}

export function paramHistory(ctx: AwsCtx, name: string) {
  return fetchNow<SsmParamVersion[]>(ctx, async () => {
    const r = await client(SSMClient, ctx).send(new GetParameterHistoryCommand({ Name: name, WithDecryption: false, MaxResults: 50 }))
    return (r.Parameters || []).map(p => ({ version: p.Version || 0, modifiedAt: ms(p.LastModifiedDate), modifiedBy: who(p.LastModifiedUser || ''), type: p.Type || '' }))
      .sort((a, b) => b.version - a.version)
  })
}

/**
 * Saves a value: over the existing one (same type and key) or as a new parameter. The audit log
 * records the size of the value, never the value itself.
 */
export function paramPut(ctx: AwsCtx, o: { name: string; value: string; type: string; overwrite: boolean; description?: string; keyId?: string }) {
  return write(ctx, 'ssm:PutParameter', o.name, { type: o.type, overwrite: o.overwrite, value_bytes: Buffer.byteLength(o.value) }, async () => {
    const r = await client(SSMClient, ctx).send(new PutParameterCommand({
      Name: o.name,
      Value: o.value,
      Type: o.type as ParameterType,
      Overwrite: o.overwrite,
      Description: o.description || undefined,
      KeyId: o.type === 'SecureString' && o.keyId ? o.keyId : undefined,
    }))
    invalidate(ctx, `ssm:params:${ctx.region}`)
    return `v${r.Version ?? ''}`
  })
}
