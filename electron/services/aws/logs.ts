// CloudWatch Logs: groups, streams, a stream's latest events, pattern search, and live tail
// streamed to the window as it arrives.
import { CloudWatchLogsClient, DescribeLogGroupsCommand, DescribeLogStreamsCommand, FilterLogEventsCommand, GetLogEventsCommand, StartLiveTailCommand } from '@aws-sdk/client-cloudwatch-logs'
import type { AwsCtx, LogEvent, LogGroup, LogStream, LogTailMsg } from '../../../shared/aws'
import { client, fetchNow, gateOpen, problemOf, read } from './core'

/** One page of groups (50), from where the last page left off; the window chains them. */
export function logGroups(ctx: AwsCtx, token: string | null, force: boolean) {
  return read<{ groups: LogGroup[]; next: string | null }>(ctx, `logs:groups:${ctx.region}:${token || ''}`, 60_000, force, async () => {
    const r = await client(CloudWatchLogsClient, ctx).send(new DescribeLogGroupsCommand({ limit: 50, nextToken: token || undefined }))
    return {
      groups: (r.logGroups || []).map(g => ({ name: g.logGroupName || '', arn: (g.arn || '').replace(/:\*$/, ''), retention: g.retentionInDays || 0, bytes: g.storedBytes || 0 })),
      next: r.nextToken || null,
    }
  })
}

/** Every group, walking all the pages: for the finder. */
export async function allLogGroups(ctx: AwsCtx) {
  const out: LogGroup[] = []
  let token: string | null = null
  for (let i = 0; i < 200; i++) {
    const r = await logGroups(ctx, token, false)
    if (!r.ok) return r
    out.push(...r.data.groups)
    token = r.data.next
    if (!token) break
  }
  return { ok: true as const, data: out }
}

export function logStreams(ctx: AwsCtx, group: string, force: boolean) {
  return read<LogStream[]>(ctx, `logs:streams:${ctx.region}:${group}`, 30_000, force, async () => {
    const r = await client(CloudWatchLogsClient, ctx).send(new DescribeLogStreamsCommand({ logGroupName: group, orderBy: 'LastEventTime', descending: true, limit: 50 }))
    return (r.logStreams || []).map(s => ({ name: s.logStreamName || '', lastEvent: s.lastEventTimestamp || 0 }))
  })
}

/** The latest 1000 events of a stream, oldest first: paged backwards until there are enough. */
export function logEvents(ctx: AwsCtx, group: string, stream: string) {
  return fetchNow<LogEvent[]>(ctx, async () => {
    const c = client(CloudWatchLogsClient, ctx)
    const out: LogEvent[] = []
    let token: string | undefined
    for (let i = 0; i < 100 && out.length < 1000; i++) {
      const r = await c.send(new GetLogEventsCommand({ logGroupName: group, logStreamName: stream, startFromHead: false, limit: 1000, nextToken: token }))
      for (const e of r.events || []) out.push({ at: e.timestamp || 0, stream, message: e.message || '' })
      if (!r.nextBackwardToken || r.nextBackwardToken === token || !(r.events || []).length) break
      token = r.nextBackwardToken
    }
    return out.sort((a, b) => a.at - b.at).slice(-1000)
  })
}

/** Events matching a filter pattern within a time range; `more` when AWS had others to give. */
export function logSearch(ctx: AwsCtx, group: string, pattern: string, start: number, end: number) {
  return fetchNow<{ events: LogEvent[]; more: boolean }>(ctx, async () => {
    const r = await client(CloudWatchLogsClient, ctx).send(new FilterLogEventsCommand({
      logGroupName: group, startTime: start, endTime: end, limit: 1000, filterPattern: pattern.trim() || undefined,
    }))
    return { events: (r.events || []).map(e => ({ at: e.timestamp || 0, stream: e.logStreamName || '', message: e.message || '' })), more: !!r.nextToken }
  })
}

const tails = new Map<string, AbortController>()

/**
 * Follows a group as events arrive, sending them on in batches. AWS ends a tail after an hour;
 * it starts again by itself until stopped.
 */
export function tailStart(ctx: AwsCtx, id: string, groupArn: string, emit: (m: LogTailMsg) => void) {
  tailStop(id)
  if (!gateOpen()) {
    emit({ id, state: 'error', error: 'AWS is locked.' })
    return
  }
  const ac = new AbortController()
  tails.set(id, ac)
  const run = async () => {
    while (!ac.signal.aborted) {
      try {
        const r = await client(CloudWatchLogsClient, ctx).send(new StartLiveTailCommand({ logGroupIdentifiers: [groupArn.replace(/:\*$/, '')] }), { abortSignal: ac.signal })
        emit({ id, state: 'live' })
        for await (const ev of r.responseStream || []) {
          if (ac.signal.aborted) break
          if (ev.sessionUpdate) {
            const events = (ev.sessionUpdate.sessionResults || []).map(e => ({ at: e.timestamp || 0, stream: e.logStreamName || '', message: e.message || '' }))
            if (events.length) emit({ id, events })
          } else if (ev.SessionTimeoutException) {
            break
          } else if (ev.SessionStreamingException) {
            throw new Error(ev.SessionStreamingException.message || 'The live tail stopped.')
          }
        }
      } catch (e: any) {
        if (ac.signal.aborted) break
        emit({ id, state: 'error', error: problemOf(e).error })
        tails.delete(id)
        return
      }
    }
    if (tails.get(id) === ac) tails.delete(id)
    emit({ id, state: 'ended' })
  }
  run()
}

export function tailStop(id: string) {
  const ac = tails.get(id)
  if (!ac) return
  tails.delete(id)
  ac.abort()
}

export function stopAllTails() {
  for (const id of [...tails.keys()]) tailStop(id)
}

