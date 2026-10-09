import { defineStore } from 'pinia'
import type { Prefs, ThemePref } from '#shared/types'
import { ACTIONS, keysOf } from '#shared/actions'

export const DEFAULT_PREFS: Prefs = {
  editor: 'VS Code',
  startCmd: 'claude',
  launchLogin: true,
  tray: true,
  resume: true,
  autoUpdate: true,
  waitStyle: 'both',
  showCost: true,
  appFont: 'Outfit',
  termFont: 'JetBrains Mono',
  termSize: 12,
  termLineHeight: 1.15,
  termWeight: 400,
  termWeightBold: 700,
  termLetterSpacing: 0,
  termBrightness: 'normal',
  termContrast: false,
  termBoldBright: true,
  cursorBlink: true,
  cursor: 'Block',
  scrollback: '3000',
  notifyWaiting: true,
  notifyDone: true,
  skipViewing: true,
  sound: false,
  dnd: false,
  termTheme: 'dark',
  shell: 'powershell',
  panelDock: 'bottom',
  panelSize: { bottom: 260, right: 460 },
  summonKey: 'Alt+Space',
  reviewNotify: true,
  reviewRemind: 60,
  showMetrics: true,
  awsTotp: true,
  awsUnlockHours: 4,
  awsDryRun: false,
}

/** The session window in the workspace simulation is always a little see-through: 90% at most, 90% unless set. */
export const SIM_GLASS_MAX = 90
export function simGlassOf(p: Prefs) {
  return Math.min(SIM_GLASS_MAX, Math.max(30, p.simGlass ?? SIM_GLASS_MAX))
}

export const usePrefsStore = defineStore('prefs', () => {
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS })
  /** Shortcut overrides only; actions without an entry use their defaults. */
  const keys = ref<Record<string, string[]>>({})
  const theme = ref<ThemePref>('dark')

  const colorMode = useColorMode()
  const resolvedTheme = computed<'dark' | 'light'>(() => (colorMode.value === 'light' ? 'light' : 'dark'))
  /** Terminals stay dark unless set to follow the app, since Claude Code draws for its own theme. */
  const terminalDark = computed(() => resolvedTheme.value === 'dark' || (prefs.value.termTheme ?? 'dark') === 'dark')

  watch(theme, (t) => {
    colorMode.preference = t
  }, { immediate: true })

  function set(patch: Partial<Prefs>) {
    prefs.value = { ...prefs.value, ...patch }
  }

  function keysFor(id: string) {
    return keysOf(keys.value, id)
  }

  /** First binding of an action, spaced for display, e.g. "Ctrl Shift P". */
  function kl(id: string) {
    const k = keysFor(id)[0]
    return k ? k.replace(/\+/g, ' ') : ''
  }

  function assignKey(id: string, idx: number | null, combo: string, stealFrom?: string) {
    const next = { ...keys.value }
    if (stealFrom) next[stealFrom] = keysOf(keys.value, stealFrom).filter(k => k !== combo)
    const cur = [...keysOf(keys.value, id)]
    if (idx == null || idx >= cur.length) cur.push(combo)
    else cur[idx] = combo
    next[id] = [...new Set(cur)]
    keys.value = next
  }

  function removeKey(id: string, idx: number) {
    keys.value = { ...keys.value, [id]: keysOf(keys.value, id).filter((_, j) => j !== idx) }
  }

  function resetKey(id: string) {
    const next = { ...keys.value }
    delete next[id]
    keys.value = next
  }

  function resetAllKeys() {
    keys.value = {}
  }

  function toggleTheme() {
    theme.value = resolvedTheme.value === 'light' ? 'dark' : 'light'
  }

  return { prefs, keys, theme, resolvedTheme, terminalDark, set, keysFor, kl, assignKey, removeKey, resetKey, resetAllKeys, toggleTheme, actions: ACTIONS }
})
