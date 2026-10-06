// Keyboard shortcuts, generated from the user's keybindings so rebinding takes effect immediately.
import { useEventListener } from '@vueuse/core'
import { ACTIONS, comboOf, keysOf, matchAction } from '#shared/actions'

const NUXT_KEY: Record<string, string> = { '→': 'arrowright', '←': 'arrowleft', '↑': 'arrowup', '↓': 'arrowdown', 'Esc': 'escape', 'Space': 'space' }

/** "Ctrl+Shift+P" -> "ctrl_shift_p". Returns null for keys defineShortcuts can't match (Alt with punctuation). */
function toNuxt(combo: string): string | null {
  const parts = combo.split('+')
  const key = parts.pop()!
  const mods = parts.map(m => m.toLowerCase())
  const k = NUXT_KEY[key] || key.toLowerCase()
  if (mods.includes('alt') && !/^([a-z0-9]|f\d+|arrow\w+|enter|escape|tab|space|backspace|delete)$/.test(k)) return null
  if (k === '_' || k === '-') return null
  return [...mods, k].join('_')
}

export function useAppShortcuts() {
  const prefs = usePrefsStore()
  const ui = useUiStore()
  const P = useProjectsStore()

  /** Mirrors the prototype: modals swallow shortcuts; the palettes only answer to their own keys. */
  function allowed(id: string) {
    if (ui.lightbox) return false
    if (ui.projectModal || ui.settings || ui.about || ui.updOpen || ui.summary) return false
    if (ui.explorer) return id === 'files'
    if (ui.palette) return id === 'jump' || id === 'commands'
    return true
  }

  function run(id: string) {
    if (!allowed(id)) return
    if (ui.explorer && id === 'files') {
      ui.explorer = null
      ui.focusLater()
      return
    }
    if (ui.palette && ((id === 'jump' && ui.palette === 'nav') || (id === 'commands' && ui.palette === 'cmd'))) {
      ui.palette = null
      ui.focusLater()
      return
    }
    ui.runAction(id)
  }

  const fallback = new Map<string, string>()

  const config = computed(() => {
    const c: Record<string, { usingInput: true; handler: () => void }> = {}
    fallback.clear()
    for (const a of ACTIONS) {
      if (a.scope) continue
      for (const combo of keysOf(prefs.keys, a.id)) {
        const nk = toNuxt(combo)
        if (nk) c[nk] = { usingInput: true, handler: () => run(a.id) }
        else fallback.set(combo, a.id)
      }
    }
    for (let i = 1; i <= 9; i++) {
      c[`alt_${i}`] = {
        usingInput: true,
        handler: () => {
          if (ui.palette || ui.projectModal || ui.settings || ui.explorer || ui.lightbox) return
          const p = P.ordered[i - 1]
          if (p) ui.selectProject(p.id)
        },
      }
    }
    return c
  })

  defineShortcuts(config)

  // Alt with punctuation (Alt ] and Alt [) isn't matched by defineShortcuts, so handle those here.
  useEventListener('keydown', (e: KeyboardEvent) => {
    const cb = comboOf(e)
    const id = cb && fallback.get(cb)
    if (!id) return
    e.preventDefault()
    run(id)
  })

  // Shell panel shortcuts win while focus is in the dock panel: caught before the terminal and the app-wide shortcuts see the key.
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (!(document.activeElement as HTMLElement | null)?.closest('[data-dock-panel]')) return
    const id = matchAction(prefs.keys, comboOf(e), 'shell')
    if (!id || !allowed(id)) return
    e.preventDefault()
    e.stopImmediatePropagation()
    run(id)
  }, { capture: true })
}
