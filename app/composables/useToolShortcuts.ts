// The few app-wide shortcuts that work from a GitHub, AWS or SSH window: the three toggles (so the key that
// opened a window also puts it away, or jumps to another) and quitting. The window's own keys live in the window.
import { useEventListener } from '@vueuse/core'
import { comboOf, matchAction } from '#shared/actions'

const GLOBAL = new Set(['github', 'aws', 'ssh', 'quit'])
/** In the SSH window the keys that switch and close sessions do the same for its connections. */
const SSH_TAB_KEYS = ['nextSession', 'prevSession', 'nextProject', 'prevProject', 'paneRight', 'paneLeft', 'closeTerminal', 'closeAll']

export function useToolShortcuts() {
  const prefs = usePrefsStore()
  const ui = useUiStore()
  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    const id = matchAction(prefs.keys, comboOf(e))
    if (!id || !(GLOBAL.has(id) || (toolKind === 'ssh' && SSH_TAB_KEYS.includes(id)))) return
    e.preventDefault()
    e.stopPropagation()
    ui.runAction(id)
  }, { capture: true })
}
