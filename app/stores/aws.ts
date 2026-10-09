import { defineStore } from 'pinia'
import { AWS_TABS, type AwsBookmark, type AwsCtx, type AwsDone, type AwsLockState, type AwsProblem, type AwsProfile, type AwsResult, type AwsTab, type AwsTerm } from '#shared/aws'
import type { AwsLink } from '~/utils/aws'
import { disposeTerminal, ensureTerminal, terminalSize, writeToTerminal } from '~/utils/terminals'

/** A one-key choice shown along the bottom, such as a sort column or what to copy. */
export interface AwsChoice {
  title: string
  options: { key: string; alt?: string; label: string; run: () => void }[]
}

/**
 * A question before a change. With `typed`, the answer has to be typed out (an instance id, an
 * environment's name) before it goes ahead, as aws-tui asks.
 */
export interface AwsAsk {
  title: string
  body: string
  /** Shown as a list under the body, such as the paths of an invalidation. */
  lines?: string[]
  typed?: string
  ok: string
  run: () => void
}

/**
 * The AWS window, aws-tui in Canopy: which profile and region it is on, the service showing, the
 * TOTP lock, jumps from one service to another (bookmarks, the finder, related links, the 3D World),
 * the questions asked before a change, and the AWS CLI sessions running in its terminals. The last
 * profile and regions and the bookmarks are shared with aws-tui.
 */
export const useAwsStore = defineStore('aws', () => {
  const ui = useUiStore()

  const lock = ref<AwsLockState | null>(null)
  const profiles = ref<AwsProfile[]>([])
  const profile = ref('')
  const region = ref('')
  const lastRegions = ref<Record<string, string>>({})
  const allBookmarks = ref<Record<string, AwsBookmark[]>>({})
  const ready = ref(false)

  const ctx = computed<AwsCtx | null>(() => (profile.value && region.value ? { profile: profile.value, region: region.value } : null))
  /** A plain copy of the context for IPC, which can't send reactive objects. */
  const c = (): AwsCtx => ({ profile: profile.value, region: region.value })

  const tab = ref<AwsTab>('Beanstalk')
  /** Dialogs over the screens: the profile and region pickers, the finder, bookmarks, related links, help. */
  const picker = ref<'profile' | 'region' | null>(null)
  const finder = ref(false)
  const bookmarksOpen = ref(false)
  const links = ref<AwsLink[] | null>(null)
  const help = ref(false)
  const choice = ref<AwsChoice | null>(null)
  const ask = ref<AwsAsk | null>(null)
  /** The terminal showing in place of the service, if any. */
  const term = ref<string | null>(null)
  const terms = ref<AwsTerm[]>([])
  /** The profile whose SSO sign-in ran out, until it is renewed. */
  const ssoExpired = ref<string | null>(null)

  /**
   * A request to show something in a service: its list filtered by `query`. Each service reads the
   * latest one for itself when it shows; `seq` makes a repeat count.
   */
  const jump = ref<{ tab: AwsTab; query: string; seq: number } | null>(null)
  let seq = 0

  // ---------- Starting up ----------

  async function checkLock() {
    lock.value = await api.aws.lockState()
    return lock.value
  }

  /** Reads the profiles, the lock and what was used last; picks up where aws-tui or Canopy left off. */
  async function init() {
    const [l, list, st] = await Promise.all([api.aws.lockState(), api.aws.profiles(), api.aws.state()])
    lock.value = l
    profiles.value = list
    lastRegions.value = st.lastRegions || {}
    allBookmarks.value = st.bookmarks || {}
    if (!profile.value) {
      const p = list.find(x => x.name === st.lastProfile) || (list.length === 1 ? list[0] : undefined)
      if (p) {
        profile.value = p.name
        region.value = lastRegions.value[p.name] || p.region
      }
    }
    if (!profile.value) picker.value = 'profile'
    else if (!region.value) picker.value = 'region'
    ready.value = true
  }

  function useProfile(name: string) {
    const p = profiles.value.find(x => x.name === name)
    profile.value = name
    ssoExpired.value = null
    region.value = lastRegions.value[name] || p?.region || ''
    picker.value = region.value ? null : 'region'
    if (region.value) api.aws.remember(name, region.value)
  }

  function useRegion(r: string) {
    region.value = r
    lastRegions.value = { ...lastRegions.value, [profile.value]: r }
    picker.value = null
    api.aws.remember(profile.value, r)
  }

  // ---------- Services ----------

  function go(t: AwsTab) {
    tab.value = t
    term.value = null
  }

  /** The next or previous service, wrapping round, as Tab does in aws-tui. */
  function step(d: number) {
    const i = AWS_TABS.indexOf(tab.value)
    go(AWS_TABS[(i + d + AWS_TABS.length) % AWS_TABS.length]!)
  }

  /** Shows a service filtered to something: from a bookmark, the finder, a related link or the 3D World. */
  function jumpTo(t: AwsTab, query: string) {
    go(t)
    finder.value = false
    bookmarksOpen.value = false
    links.value = null
    jump.value = { tab: t, query, seq: ++seq }
  }

  /** Related resources: straight there when there is one, a list to pick from when there are more. */
  function related(list: AwsLink[]) {
    if (!list.length) return ui.toast({ title: `Nothing related on ${tab.value}` })
    if (list.length === 1) return jumpTo(list[0]!.tab, list[0]!.query)
    links.value = list
  }

  // ---------- Bookmarks ----------

  const bookmarks = computed(() => allBookmarks.value[profile.value] || [])
  const isBookmarked = (t: AwsTab, id: string) => bookmarks.value.some(b => b.tab === t && b.id === id)

  function toggleBookmark(t: AwsTab, id: string, label: string) {
    const had = isBookmarked(t, id)
    const list = had ? bookmarks.value.filter(b => !(b.tab === t && b.id === id)) : [...bookmarks.value, { tab: t, region: region.value, id, label, added_at: new Date().toISOString() }]
    allBookmarks.value = { ...allBookmarks.value, [profile.value]: list }
    api.aws.saveBookmarks(profile.value, JSON.parse(JSON.stringify(list)))
    ui.toast({ title: had ? 'Bookmark removed' : 'Bookmarked', body: `${t} · ${label}` })
  }

  function openBookmark(b: AwsBookmark) {
    if (b.region && b.region !== region.value) useRegion(b.region)
    jumpTo(b.tab as AwsTab, b.id)
  }

  function removeBookmark(b: AwsBookmark) {
    toggleBookmark(b.tab as AwsTab, b.id, b.label)
  }

  // ---------- Calls ----------

  /** Notes what a failed call says about the lock or the sign-in, so the window can offer the fix. */
  function noteProblem(problem?: AwsProblem) {
    if (problem === 'locked') checkLock()
    else if (problem === 'sso') ssoExpired.value = profile.value
  }

  /** A read: its problem noted, the result handed back as it came. */
  async function call<T>(p: Promise<AwsResult<T>>): Promise<AwsResult<T>> {
    const r = await p
    if (!r.ok) noteProblem(r.problem)
    return r
  }

  /** After a change: says it happened, or only went to the audit log in dry-run, or what went wrong. */
  function done(r: AwsDone, title: string, body = '') {
    if (!r.ok) {
      noteProblem(r.problem)
      ui.toast({ title: `Could not ${title.charAt(0).toLowerCase()}${title.slice(1)}`, body: r.error, error: true })
      return false
    }
    ui.toast(r.dryRun ? { title: `Dry run: ${title}`, body: 'Only written to the audit log. Turn dry run off in Settings › AWS to make changes.' } : { title, body })
    return true
  }

  // ---------- Lock ----------

  async function lockNow() {
    await api.aws.lock()
    await checkLock()
    ui.toast({ title: 'AWS locked', body: 'Enter a TOTP code to use it again. aws-tui is locked too.' })
  }

  // ---------- Terminals ----------

  let termSeq = 0

  /** Runs an AWS CLI session in a terminal and shows it: an SSM shell, a port forward, a tail or a sign-in. */
  async function openTerm(kind: AwsTerm['kind'], title: string, o: { instance?: string; remotePort?: number; localPort?: number; host?: string; group?: string } = {}) {
    const id = `aws-${Date.now().toString(36)}-${++termSeq}`
    ensureTerminal(id)
    const { cols, rows } = terminalSize(id)
    const r = await api.aws.term(c(), id, { kind, ...o }, cols, rows)
    if (!r.ok) {
      disposeTerminal(id)
      ui.toast({ title: `Could not start ${title}`, body: r.error, error: true })
      return
    }
    terms.value = [...terms.value, { id, title, kind, cmd: r.cmd || '', startedAt: Date.now(), exited: false }]
    term.value = id
  }

  function onTermExit(id: string, code: number) {
    const t = terms.value.find(x => x.id === id)
    if (!t) return
    writeToTerminal(id, `\r\n\x1b[2m[${t.title} ended · code ${code}]\x1b[0m\r\n`)
    terms.value = terms.value.map(x => (x.id === id ? { ...x, exited: true, code } : x))
    // A finished SSO sign-in: the profile's new credentials are read from scratch.
    if (t.kind === 'login' && code === 0) {
      api.aws.forget(profile.value)
      ssoExpired.value = null
      ui.toast({ title: 'Signed in', body: `${profile.value} is ready again.` })
    }
  }

  function closeTerm(id: string) {
    api.pty.kill(id)
    disposeTerminal(id)
    terms.value = terms.value.filter(x => x.id !== id)
    if (term.value === id) term.value = null
  }

  /** Signs in again with the AWS CLI, for an SSO session that ran out. */
  function signIn() {
    openTerm('login', `SSO sign-in · ${profile.value}`)
  }

  /** Asks a question in the window; runs `run` once answered. */
  function confirm(a: AwsAsk) {
    ask.value = a
  }

  function choose(title: string, options: AwsChoice['options']) {
    choice.value = { title, options }
  }

  return {
    lock, profiles, profile, region, lastRegions, ready, ctx, c, tab, picker, finder, bookmarksOpen, links, help, choice, ask, term, terms, ssoExpired, jump,
    bookmarks, checkLock, init, useProfile, useRegion, go, step, jumpTo, related, isBookmarked, toggleBookmark, openBookmark, removeBookmark,
    call, done, lockNow, openTerm, onTermExit, closeTerm, signIn, confirm, choose,
  }
})
