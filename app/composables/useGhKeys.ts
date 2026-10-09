// Keyboard handling for the GitHub window, gh-tui style: each screen says what its keys do while it
// shows, the screen in front (a dialog over a PR, say) first. The window turns a key into one of the
// rebindable 'github' actions and runs the first screen's handler for it; the footer lists them.
import type { Ref } from 'vue'

export interface GhKey {
  run: () => void
  /** Shown in the window's footer, such as "approve". Left out for keys that don't need a reminder. */
  hint?: string
}

export interface GhKeyLayer {
  keys: Partial<Record<string, GhKey>>
  /** A dialog: keys stop here instead of falling through to the screen underneath. */
  modal?: boolean
}

const layers = shallowRef<Ref<GhKeyLayer>[]>([])

/** Hands the keyboard back to the GitHub window, as after closing a comment box. */
export function focusGhWindow() {
  nextTick(() => (document.querySelector('[data-gh-root]') as HTMLElement | null)?.focus())
}

/** Gives a screen keys for as long as it is mounted. */
export function useGhKeys(layer: () => GhKeyLayer) {
  const r = computed(layer)
  onMounted(() => { layers.value = [...layers.value, r] })
  onBeforeUnmount(() => { layers.value = layers.value.filter(x => x !== r) })
}

/** The screens' layers, the one in front first, down to the first dialog. */
export function ghLayers(): GhKeyLayer[] {
  const out: GhKeyLayer[] = []
  for (const l of [...layers.value].reverse()) {
    out.push(l.value)
    if (l.value.modal) break
  }
  return out
}

/**
 * Up and down through a list with the keyboard, and Enter to open the selected item. The selected
 * row carries `data-gh-sel`, and is scrolled into view as it moves.
 */
export function useGhList<T>(items: () => T[], open: (item: T) => void, extra: () => Partial<Record<string, GhKey>> = () => ({})) {
  const sel = ref(0)
  const list = computed(items)
  watch(() => list.value.length, (n) => { if (sel.value >= n) sel.value = Math.max(0, n - 1) })
  const move = (d: number) => {
    const n = list.value.length
    if (!n) return
    sel.value = Math.min(n - 1, Math.max(0, sel.value + d))
    nextTick(() => document.querySelector('[data-gh-sel="true"]')?.scrollIntoView({ block: 'nearest' }))
  }
  useGhKeys(() => ({
    keys: {
      ghDown: { run: () => move(1), hint: 'move' },
      ghUp: { run: () => move(-1) },
      ghOpen: { run: () => { const it = list.value[sel.value]; if (it) open(it) }, hint: 'open' },
      ...extra(),
    },
  }))
  return { sel, selected: computed(() => list.value[sel.value] as T | undefined) }
}
