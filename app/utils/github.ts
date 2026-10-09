// Words and colours for pull requests, workflow runs and security alerts, shared by the GitHub view and GitHub HQ.
import type { GhAlert, GhPull, GhReview, GhRun } from '#shared/types'

export const REVIEW_LABEL: Record<GhReview, string> = { mine: 'Waiting for your review', approved: 'Approved', changes: 'Changes requested', waiting: 'Waiting for review', draft: 'Draft' }
export const REVIEW_DOT: Record<GhReview, string> = { mine: '#f2c94c', approved: '#2da44e', changes: '#cf222e', waiting: '#54aeff', draft: '#8c959f' }
export const RUN_LABEL: Record<GhRun['state'], string> = { queued: 'Queued', running: 'Running', success: 'Succeeded', failure: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped' }
export const RUN_DOT: Record<GhRun['state'], string> = { queued: '#d4a72c', running: '#f5b544', success: '#2da44e', failure: '#ff4d4f', cancelled: '#8c959f', skipped: '#6e7781' }
export const RUN_ICON: Record<GhRun['state'], string> = {
  queued: 'i-hugeicons-clock-01', running: 'i-hugeicons-loading-03', success: 'i-hugeicons-checkmark-circle-02',
  failure: 'i-hugeicons-cancel-circle', cancelled: 'i-hugeicons-remove-circle', skipped: 'i-hugeicons-remove-circle',
}
export const CHECKS_LABEL: Record<NonNullable<GhPull['checks']>, string> = { pass: 'Checks pass', fail: 'Checks failing', pending: 'Checks running' }
export const CHECKS_DOT: Record<NonNullable<GhPull['checks']>, string> = { pass: '#2da44e', fail: '#ff4d4f', pending: '#f5b544' }
export const SEV_LABEL: Record<GhAlert['severity'], string> = { critical: 'Critical', high: 'High', moderate: 'Moderate', low: 'Low' }
export const SEV_DOT: Record<GhAlert['severity'], string> = { critical: '#ff4d4f', high: '#f0883e', moderate: '#d4a72c', low: '#8c959f' }

/** The notification id for review requests: clicking one opens the GitHub window (on a PR after a "|"). */
export const GH_NOTIFY = 'github'

/** "acme/web" -> "web". */
export const repoShort = (repo: string) => repo.split('/').pop() || repo

export const isLive = (r: { state: GhRun['state'] }) => r.state === 'running' || r.state === 'queued'
