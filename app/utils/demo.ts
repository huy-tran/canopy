// Demo mode (npm run dev:demo): made-up projects and Claude sessions, so the sidebar, the terminals
// and the 3D World have something in them. Nothing runs: the sessions have no process behind them,
// their terminals show canned text, and a timer moves them between working, waiting and done.
// Nothing is saved either, so the demo never mixes with real data.
import type { Act, Project, Repo, Session, Status } from '#shared/types'
import { ensureTerminal, writeToTerminal } from './terminals'

/** Started with ?demo=1 on the page, which the main process adds for CANOPY_DEMO=1. */
export const isDemo = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

const repo = (id: string, label: string, path: string, stack: string, branch = 'main'): Repo =>
  ({ id, label, path, cmd: 'claude', stack, branch, services: [] })

const project = (id: string, name: string, hue: number, repos: Repo[], layout: Project['layout'] = 'tabs'): Project => ({
  id, name, hue, repos, layout, view: 'terminals', expanded: true, autoStart: false, autoServices: false, resume: false, editor: 'VS Code', createdAt: Date.now() - 30 * 86_400_000,
})

const PROJECTS: Project[] = [
  project('demo-pay', 'Acme Payments', 25, [repo('pay-api', 'api', 'C:\\demo\\acme-payments\\api', 'Laravel'), repo('pay-web', 'web', 'C:\\demo\\acme-payments\\web', 'Nuxt')], 'split'),
  project('demo-kin', 'Kindred', 150, [repo('kin-client', 'client', 'C:\\demo\\kindred\\client', 'Next.js'), repo('kin-api', 'backend', 'C:\\demo\\kindred\\backend', 'Django')], 'grid'),
  project('demo-shop', 'Corporate Tailors', 290, [repo('shop-wp', 'site', 'C:\\demo\\tailors\\site', 'WordPress')]),
  project('demo-mob', 'Field App', 210, [repo('mob-app', 'app', 'C:\\demo\\field-app\\app', 'Expo')]),
]

interface Seed { pid: string; repoId: string; title: string; status: Status; model: string; tokOut: number; ctx: number; branch?: string; waitWhat?: string; subs?: string[] }

const SEEDS: Seed[] = [
  { pid: 'demo-pay', repoId: 'pay-api', title: 'Retry failed Stripe webhooks', status: 'working', model: 'Opus 5.5', tokOut: 48_000, ctx: 62, branch: 'feat/webhook-retries', subs: ['Explore: find webhook handlers'] },
  { pid: 'demo-pay', repoId: 'pay-web', title: 'Invoice PDF layout', status: 'waiting', model: 'Sonnet 5.5', tokOut: 21_000, ctx: 35, waitWhat: 'Bash: npm run build' },
  { pid: 'demo-pay', repoId: 'pay-api', title: 'Refund report export', status: 'done', model: 'Sonnet 5.5', tokOut: 9_000, ctx: 18 },
  { pid: 'demo-kin', repoId: 'kin-client', title: 'Booking fee copy', status: 'working', model: 'Opus 5.5', tokOut: 66_000, ctx: 71, branch: 'content/booking-fee', subs: ['general-purpose: check copy', 'Explore: pricing pages'] },
  { pid: 'demo-kin', repoId: 'kin-api', title: 'Supervisee video model', status: 'working', model: 'Sonnet 5.5', tokOut: 30_000, ctx: 44 },
  { pid: 'demo-kin', repoId: 'kin-client', title: 'Lighthouse fixes', status: 'idle', model: 'Haiku 5.5', tokOut: 4_000, ctx: 9 },
  { pid: 'demo-kin', repoId: 'kin-api', title: 'Migrate to Django 6', status: 'waiting', model: 'Opus 5.5', tokOut: 82_000, ctx: 88, waitWhat: 'Edit: settings/base.py' },
  { pid: 'demo-shop', repoId: 'shop-wp', title: 'WooCommerce checkout fields', status: 'idle', model: 'Sonnet 5.5', tokOut: 12_000, ctx: 22 },
  { pid: 'demo-shop', repoId: 'shop-wp', title: 'Size guide block', status: 'done', model: 'Sonnet 5.5', tokOut: 7_500, ctx: 15 },
  { pid: 'demo-mob', repoId: 'mob-app', title: 'Offline sync queue', status: 'working', model: 'Opus 5.5', tokOut: 54_000, ctx: 57, branch: 'feat/offline-sync' },
]

const SAID = [
  'I found the handler. It swallows the exception, so the retry never fires.',
  'The tests pass. I\'ll tidy up the names next.',
  'There are two places that build this query; I\'ll merge them.',
  'This needs a migration. Writing it now.',
  'The layout breaks below 640px. Fixing the grid.',
  'Done. Want me to open a pull request?',
]
const DOING: [Act, string][] = [
  ['read', 'Reading app/Http/Controllers/WebhookController.php'],
  ['write', 'Editing src/components/InvoiceTable.vue'],
  ['run', 'Running npm run lint'],
  ['test', 'Running php artisan test --filter=Webhook'],
  ['web', 'Searching the Stripe docs'],
  ['plan', 'Planning the change'],
  ['delegate', 'Asking a subagent to explore'],
]
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!

/** What a Claude Code terminal looks like mid-session, near enough. */
function transcript(s: Seed) {
  const dim = (t: string) => `\x1b[2m${t}\x1b[0m`
  return [
    `\x1b[38;5;209m✻\x1b[0m \x1b[1mClaude Code\x1b[0m ${dim('· demo session')}`,
    '',
    `\x1b[1m>\x1b[0m ${s.title}`,
    '',
    `\x1b[38;5;114m⏺\x1b[0m I'll start by looking at how this works today.`,
    '',
    `\x1b[38;5;114m⏺\x1b[0m \x1b[1mRead\x1b[0m(src/…)`,
    dim('  ⎿  Read 182 lines'),
    '',
    `\x1b[38;5;114m⏺\x1b[0m ${pick(SAID)}`,
    '',
    dim('  Demo session: nothing runs here, and typing does nothing.'),
    '',
  ].join('\r\n')
}

export function seedDemo() {
  const P = useProjectsStore()
  const S = useSessionsStore()
  const now = Date.now()
  P.projects = PROJECTS.map(p => ({ ...p, repos: p.repos.map(r => ({ ...r })) }))
  P.sel = PROJECTS[0]!.id

  const sessions: Session[] = SEEDS.map((x, i) => {
    const p = PROJECTS.find(q => q.id === x.pid)!
    const r = p.repos.find(q => q.id === x.repoId)!
    return {
      id: `demo-s${i}`, kind: 'claude', pid: x.pid, repoId: x.repoId, cwd: r.path, cmd: 'claude', title: x.title, status: x.status, branch: x.branch || r.branch, wt: null,
      model: x.model, ctx: x.ctx, tokIn: x.tokOut * 3, tokOut: x.tokOut, cacheR: x.tokOut * 20, cacheW: x.tokOut * 2, images: [],
      started: now - (20 + i * 7) * 60_000, lastAt: now, endedAt: x.status === 'done' ? now - 5 * 60_000 : null,
      waitingSince: x.status === 'waiting' ? now - (2 + i) * 60_000 : null, waitWhat: x.waitWhat || '', perm: x.status === 'waiting',
      promptCount: 2, prompts: [{ t: x.title, at: now - 15 * 60_000 }], claudeId: '', changed: [], editing: '', exited: false,
    }
  })
  S.sessions = sessions
  S.focus = Object.fromEntries(PROJECTS.map(p => [p.id, sessions.find(s => s.pid === p.id)?.id || null]))
  sessions.forEach((s, i) => {
    ensureTerminal(s.id)
    writeToTerminal(s.id, transcript(SEEDS[i]!))
    const subs = SEEDS[i]!.subs || []
    if (subs.length) S.subagents = { ...S.subagents, [s.id]: subs.map((d, k) => ({ id: `${s.id}-sub${k}`, type: d.split(':')[0]!, desc: d.split(': ')[1] || d, bg: false, at: now })) }
    if (s.status === 'working') say(s.id)
  })

  // Every few seconds someone changes: starts or finishes work, asks for permission, says something.
  setInterval(tick, 6000)
}

function say(sid: string) {
  const S = useSessionsStore()
  const doing = Math.random() < 0.55
  const [act, text] = doing ? pick(DOING) : ['', pick(SAID)] as const
  S.chatter = { ...S.chatter, [sid]: { text, kind: doing ? 'doing' : 'said', at: Date.now() } }
  S.activity = { ...S.activity, [sid]: { act: act as Act | '', result: act === 'test' || act === 'run' ? { ok: Math.random() < 0.75, test: act === 'test', at: Date.now() } : null } }
}

function tick() {
  const S = useSessionsStore()
  const live = S.sessions.filter(s => s.id.startsWith('demo-') && !s.exited)
  if (!live.length) return
  // Whoever is working keeps talking.
  for (const s of live) if (s.status === 'working' && Math.random() < 0.6) say(s.id)
  const s = pick(live)
  const now = Date.now()
  const next: Status = s.status === 'working' ? pick<Status>(['working', 'waiting', 'done', 'idle']) : 'working'
  if (next === s.status) return
  S.patch(s.id, {
    status: next, lastAt: now,
    waitingSince: next === 'waiting' ? now : null, perm: next === 'waiting', waitWhat: next === 'waiting' ? pick(['Bash: npm test', 'Edit: src/app.ts', 'Bash: git push']) : '',
    endedAt: next === 'done' ? now : null, tokOut: s.tokOut + Math.round(Math.random() * 4000),
  })
  if (next === 'working') say(s.id)
}
