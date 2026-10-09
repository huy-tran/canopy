// Keyboard handling for the AWS window, aws-tui style: each screen says what its keys do while it
// shows, the one in front (a dialog, a confirmation) first. The window turns a key into the 'aws'
// actions bound to it and runs the first screen's handler for any of them; the footer lists them.
// A screen can also take the very next key itself, for a choice such as a sort column.
import type { Ref } from 'vue'
import type { AwsCtx, AwsResult, AwsTab } from '#shared/aws'

export interface AwsKey {
  run: () => void
  /** Shown in the footer, such as "deploy". Left out for keys that don't need a reminder. */
  hint?: string
}

export interface AwsKeyLayer {
  keys: Partial<Record<string, AwsKey>>
  /** A dialog: keys stop here instead of falling through to the screen underneath. */
  modal?: boolean
}

const layers = shallowRef<Ref<AwsKeyLayer>[]>([])

/** Hands the keyboard back to the AWS window, as after leaving a text box. */
export function focusAwsWindow() {
  nextTick(() => (document.querySelector('[data-aws-root]') as HTMLElement | null)?.focus())
}

/**
 * Gives a screen keys for as long as it shows: mounted, and active when the service it belongs to
 * is kept alive in the background.
 */
export function useAwsKeys(layer: () => AwsKeyLayer) {
  const r = computed(layer)
  const add = () => { if (!layers.value.includes(r)) layers.value = [...layers.value, r] }
  const remove = () => { layers.value = layers.value.filter(x => x !== r) }
  onMounted(add)
  onActivated(add)
  onDeactivated(remove)
  onBeforeUnmount(remove)
}

/**
 * A service picks up a jump meant for it (from a bookmark, the finder, a related link or the 3D
 * World) when it shows or while it is showing, and the jump is used up.
 */
export function useAwsJump(tab: AwsTab, apply: (query: string) => void) {
  const A = useAwsStore()
  const take = () => {
    const j = A.jump
    if (!j || j.tab !== tab) return
    A.jump = null
    apply(j.query)
  }
  watch(() => A.jump?.seq, take)
  onMounted(take)
  onActivated(take)
}

/** A read the screen shows: its data, error, when it was read, and whether it is reading. */
export function useAwsLoad<T, A extends unknown[]>(fn: (ctx: AwsCtx, ...a: A) => Promise<AwsResult<T>>) {
  const S = useAwsStore()
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref('')
  const busy = ref(false)
  const at = ref(0)
  let n = 0
  async function load(...a: A) {
    const mine = ++n
    busy.value = true
    // A call that throws (it couldn't reach the main process, say) shows as an error, never a spinner forever.
    const r = await S.call(fn(S.c(), ...a)).catch((e: any): AwsResult<T> => ({ ok: false, error: String(e?.message || e), problem: 'other' }))
    if (mine !== n) return r
    busy.value = false
    if (r.ok) {
      data.value = r.data
      at.value = r.at || Date.now()
      error.value = ''
    } else error.value = r.error
    return r
  }
  return { data, error, busy, at, load }
}

/** The screens' layers, the one in front first, down to the first dialog; `skip` leaves out that many in front. */
export function awsLayers(skip = 0): AwsKeyLayer[] {
  const out: AwsKeyLayer[] = []
  for (const l of [...layers.value].reverse().slice(skip)) {
    out.push(l.value)
    if (l.value.modal) break
  }
  return out
}

export interface AwsColumn<T> {
  key: string
  label: string
  /** The value sorted on, and shown unless `text` says otherwise. */
  value: (row: T) => string | number
  text?: (row: T) => string
  color?: (row: T) => string | undefined
  sort?: 'str' | 'num' | 'time'
  /** Takes the room left over; other columns size to their content. */
  flex?: boolean
  mono?: boolean
  align?: 'left' | 'center' | 'right'
}

/** How many rows a page key moves. */
const PAGE = 15

/**
 * A table the aws-tui way: up and down, a page at a time, top and bottom, / to filter as you type,
 * s then a column's number or first letter to sort by it (again to flip it), and Enter to open.
 * Esc clears the filter before going back. The selected row carries `data-aws-sel`.
 */
export function useAwsTable<T>(o: {
  rows: () => T[]
  columns: () => AwsColumn<T>[]
  filter: (row: T, q: string) => boolean
  open?: (row: T) => void
  openHint?: string
  /** Back from this list: up a level. Left out at a service's main list. */
  back?: () => void
  /** The screen's own keys, given the selected row. */
  keys?: (selected: T | undefined) => Partial<Record<string, AwsKey>>
  sort?: { key: string; desc?: boolean }
  /** In a dialog: its keys stop the screen underneath from seeing any. */
  modal?: boolean
  /** Whether the table is showing; one of a service's tables that isn't takes no keys. */
  active?: () => boolean
}) {
  const A = useAwsStore()
  const sel = ref(0)
  const query = ref('')
  const typing = ref(false)
  const sortBy = ref<{ key: string; desc: boolean } | null>(o.sort ? { key: o.sort.key, desc: !!o.sort.desc } : null)

  const shown = computed(() => {
    const q = query.value.trim()
    const list = q ? o.rows().filter(r => o.filter(r, q)) : [...o.rows()]
    const s = sortBy.value
    const col = s && o.columns().find(c => c.key === s.key)
    if (col) {
      const kind = col.sort || 'str'
      const val = (r: T) => {
        const v = col.value(r)
        if (kind === 'num' || kind === 'time') return typeof v === 'number' ? v : parseFloat(String(v)) || 0
        return String(v).toLowerCase()
      }
      list.sort((a, b) => {
        const x = val(a), y = val(b)
        const c = x < y ? -1 : x > y ? 1 : 0
        return s.desc ? -c : c
      })
    }
    return list
  })
  const selected = computed<T | undefined>(() => shown.value[sel.value])

  watch(() => shown.value.length, (n) => { if (sel.value >= n) sel.value = Math.max(0, n - 1) })
  watch(query, () => { sel.value = 0 })

  function move(d: number, abs = false) {
    const n = shown.value.length
    if (!n) return
    sel.value = Math.min(n - 1, Math.max(0, abs ? d : sel.value + d))
    nextTick(() => document.querySelector('[data-aws-sel="true"]')?.scrollIntoView({ block: 'nearest' }))
  }

  /** s, then a column: by its number or the first letter of its name. */
  function askSort() {
    const cols = o.columns()
    A.choose('Sort by', cols.map((c, i) => ({
      key: String(i + 1),
      alt: c.label[0]?.toLowerCase(),
      label: `${c.label}${sortBy.value?.key === c.key ? (sortBy.value.desc ? ' ↓' : ' ↑') : ''}`,
      run: () => {
        sortBy.value = sortBy.value?.key === c.key ? { key: c.key, desc: !sortBy.value.desc } : { key: c.key, desc: c.sort === 'time' }
      },
    })))
  }

  useAwsKeys(() => (o.active && !o.active() ? { keys: {} } : {
    modal: o.modal,
    keys: {
      awsDown: { run: () => move(1), hint: 'move' },
      awsUp: { run: () => move(-1) },
      awsPageDown: { run: () => move(PAGE) },
      awsPageUp: { run: () => move(-PAGE) },
      awsTop: { run: () => move(0, true) },
      awsBottom: { run: () => move(shown.value.length - 1, true) },
      ...(o.open ? { awsOpen: { run: () => { const r = selected.value; if (r) o.open!(r) }, hint: o.openHint || 'open' } } : {}),
      awsFilter: { run: () => { typing.value = true }, hint: 'filter' },
      awsSort: { run: askSort, hint: 'sort' },
      ...(query.value || o.back ? { awsBack: { run: () => (query.value ? (query.value = '') : o.back!()) } } : {}),
      ...(o.keys?.(selected.value) || {}),
    },
  }))

  return { sel, query, typing, sortBy, shown, selected, move, columns: computed(o.columns) }
}

export type AwsTableState<T> = ReturnType<typeof useAwsTable<T>>

/** Copies text and says so. */
export function copyText(text: string, what = 'Copied') {
  const ui = useUiStore()
  navigator.clipboard.writeText(text).then(() => ui.toast({ title: what, body: text.length > 140 ? `${text.slice(0, 140)}…` : text })).catch(() => {})
}
