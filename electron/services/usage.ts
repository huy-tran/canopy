// Plan usage (5-hour and weekly limits), read the same way the Claude Code CLI's /usage does:
// the OAuth usage endpoint with the CLI's stored credentials.
import fs from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import type { PlanUsage } from '../../shared/types'
import { claudeDir } from './transcript'

function token(): string | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(claudeDir(), '.credentials.json'), 'utf8'))
    return j?.claudeAiOauth?.accessToken || null
  } catch {
    return null
  }
}

function window(w: any) {
  if (!w || typeof w.utilization !== 'number') return null
  return { pct: w.utilization, resetsAt: w.resets_at ? Date.parse(w.resets_at) : 0 }
}

export async function planUsage(): Promise<PlanUsage | null> {
  const t = token()
  if (!t) return null
  try {
    const res = await net.fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { 'Authorization': `Bearer ${t}`, 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json' },
    })
    if (!res.ok) return null
    const j: any = await res.json()
    return { five: window(j.five_hour), week: window(j.seven_day) }
  } catch {
    return null
  }
}
