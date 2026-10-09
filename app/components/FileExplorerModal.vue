<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import type { ExplorerLayout, GitChange } from '#shared/types'
import type { DiffLine } from '~/utils/diff'

type Mode = 'search' | 'changes' | 'files'
interface Row { type: 'file' | 'dir'; path: string; name?: string; depth: number; idx: Set<number> | null }
interface Chg extends GitChange { by: string | null; byTitle: string; writing: boolean }
type Line = DiffLine

const ui = useUiStore()
const S = useSessionsStore()
const G = useGitStore()

const SLB: Record<string, string> = { M: 'Modified', A: 'Added', D: 'Deleted' }
const SCc: Record<string, string> = { M: 'var(--amb)', A: 'var(--grn)', D: 'var(--red)' }

const open = computed({
  get: () => !!ui.explorer,
  set: (v: boolean) => {
    if (!v) {
      ui.explorer = null
      ui.focusLater()
    }
  },
})

// Transient state, reset whenever the explorer opens or targets another repo.
const q = ref('')
const sel = ref(0)
const openDirs = ref<string[]>([])
const view = ref<'diff' | 'file'>('diff')
const onlySession = ref(false)
const files = ref<string[]>([])
const input = ref<{ inputRef?: HTMLInputElement | null } | null>(null)
const listEl = ref<HTMLElement | null>(null)
/** Diff and file text for this explorer session, keyed by kind and path. */
const cache = new Map<string, string>()

const ex = computed(() => ui.explorer)
const cwd = computed(() => ex.value?.cwd || '')
const proj = computed(() => ui.cur)
const repo = computed(() => proj.value?.repos.find(r => r.id === ex.value?.repoId) || proj.value?.repos[0] || null)
const status = computed(() => (cwd.value ? G.get(cwd.value) : null))
const changes = computed(() => status.value?.changes || [])
const fsid = computed(() => ui.fid)

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
const sessHere = computed(() => S.sessions.filter(s => norm(s.cwd) === norm(cwd.value)))

/** Changes keyed by path, attributed to the session whose changed list has them (focused session first). */
const chg = computed(() => {
  const m: Record<string, Chg> = {}
  const ss = [...sessHere.value].sort((a, b) => Number(b.id === fsid.value) - Number(a.id === fsid.value))
  for (const c of changes.value) {
    const owner = ss.find(s => s.editing === c.p) || ss.find(s => s.changed.includes(c.p))
    m[c.p] = { ...c, by: owner?.id || null, byTitle: owner?.title || '', writing: !!owner && owner.editing === c.p }
  }
  return m
})

const allFiles = computed(() => {
  const set = new Set(files.value)
  changes.value.forEach(c => set.add(c.p))
  return [...set].sort()
})

const canOnly = computed(() => {
  const f = ui.focused
  return !!f && norm(f.cwd) === norm(cwd.value)
})

function changeDirs() {
  return [...new Set(changes.value.flatMap((c) => {
    const parts = c.p.split('/')
    return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
  }))]
}

let loadKey = ''
async function reset() {
  const e = ex.value
  if (!e) return
  const key = `${e.repoId}|${e.cwd}`
  loadKey = key
  q.value = ''
  sel.value = 0
  view.value = 'diff'
  onlySession.value = false
  openDirs.value = changeDirs()
  files.value = []
  cache.clear()
  const [, list] = await Promise.all([G.refresh(e.cwd), api.git.files(e.cwd).catch(() => [] as string[])])
  if (loadKey !== key) return
  files.value = list
  openDirs.value = [...new Set([...openDirs.value, ...changeDirs()])]
}

watch(() => (ex.value ? `${ex.value.repoId}|${ex.value.cwd}` : ''), (k) => {
  if (k) reset()
  else loadKey = ''
}, { immediate: true })

// ---------- Fuzzy search and the row model (ported from the prototype) ----------

function fuzzy(qs: string, path: string) {
  const P = path.toLowerCase(), base = P.lastIndexOf('/') + 1
  const run = (from: number) => {
    const idx: number[] = []
    let j = from, score = 0, prev = -2
    for (const ch of qs) {
      if (ch === ' ') continue
      const at = P.indexOf(ch, j)
      if (at < 0) return null
      idx.push(at)
      score += at === prev + 1 ? 6 : 1
      if (at === 0 || '/._-'.includes(P[at - 1]!)) score += 4
      prev = at
      j = at + 1
    }
    return { idx, score }
  }
  const b = run(base)
  if (b) return { idx: b.idx, score: b.score + 20 - path.length / 20 }
  const a = run(0)
  return a ? { idx: a.idx, score: a.score - path.length / 20 } : null
}

function hiSegs(text: string, off: number, idx: Set<number> | null, color: string, w: number) {
  const out: { hit: boolean; t: string }[] = []
  let cur: { hit: boolean; t: string } | null = null
  for (let k = 0; k < text.length; k++) {
    const hit = !!(idx && idx.has(off + k))
    if (!cur || cur.hit !== hit) {
      cur = { hit, t: '' }
      out.push(cur)
    }
    cur.t += text[k]
  }
  return out.map(s => ({ t: s.t, color: s.hit ? 'var(--lnk)' : color, w: s.hit ? 700 : w }))
}

interface TNode { name: string; path: string; dir: boolean; kids: Record<string, TNode> }
function treeRows(list: string[], openList: string[]) {
  const root: TNode = { name: '', path: '', dir: true, kids: {} }
  list.forEach((p) => {
    let n = root
    const parts = p.split('/')
    parts.forEach((part, i) => {
      if (!n.kids[part]) n.kids[part] = { name: part, path: parts.slice(0, i + 1).join('/'), dir: i < parts.length - 1, kids: {} }
      n = n.kids[part]!
    })
  })
  const openSet = new Set(openList)
  const rows: { name: string; path: string; dir: boolean; depth: number }[] = []
  const walk = (n: TNode, depth: number) => Object.values(n.kids)
    .sort((a, b) => (Number(b.dir) - Number(a.dir)) || a.name.localeCompare(b.name))
    .forEach((c) => {
      rows.push({ name: c.name, path: c.path, dir: c.dir, depth })
      if (c.dir && openSet.has(c.path)) walk(c, depth + 1)
    })
  walk(root, 0)
  return rows
}

const mode = computed<Mode>(() => (q.value.trim() ? 'search' : ex.value?.tab === 'changes' ? 'changes' : 'files'))

const rows = computed<Row[]>(() => {
  const qs = q.value.trim().toLowerCase()
  if (mode.value === 'search') {
    return allFiles.value
      .map(f => ({ f, m: fuzzy(qs, f) }))
      .filter(x => x.m)
      .sort((a, b) => (b.m!.score + (chg.value[b.f] ? 2 : 0)) - (a.m!.score + (chg.value[a.f] ? 2 : 0)))
      .slice(0, 80)
      .map(x => ({ type: 'file' as const, path: x.f, depth: 0, idx: new Set(x.m!.idx) }))
  }
  if (mode.value === 'changes') {
    let ch = Object.values(chg.value)
    if (onlySession.value && canOnly.value) ch = ch.filter(c => c.by === fsid.value)
    return ch
      .sort((a, b) => (Number(b.staged) - Number(a.staged)) || a.p.localeCompare(b.p))
      .map(c => ({ type: 'file' as const, path: c.p, depth: 0, idx: null }))
  }
  return treeRows(allFiles.value, openDirs.value).map(n => ({ type: n.dir ? 'dir' as const : 'file' as const, path: n.path, name: n.name, depth: n.depth, idx: null }))
})

const si = computed(() => Math.min(sel.value, Math.max(0, rows.value.length - 1)))
const cur = computed<Row | null>(() => rows.value[si.value] || null)

const viewRows = computed(() => {
  const sr = cur.value
  const openSet = new Set(openDirs.value)
  const gPre = sr && sr.depth > 0
    ? (sr.type === 'dir' && openSet.has(sr.path) ? sr.path : sr.path.split('/').slice(0, -1).join('/'))
    : (sr && sr.type === 'dir' && openSet.has(sr.path) ? sr.path : null)
  const gK = gPre ? gPre.split('/').length - 1 : -1
  return rows.value.map((row, i) => {
    const guides = Array.from({ length: row.depth }, (_, k) => ({ left: `${8 + k * 14 + 4}px`, bg: k === gK && row.path.startsWith(gPre + '/') ? 'var(--mu)' : 'var(--ln)' }))
    const b = { row, i, guides, sel: i === si.value, indent: `${8 + row.depth * 14}px` }
    if (row.type === 'dir') {
      const nch = changes.value.some(c => c.p.startsWith(row.path + '/'))
      return { ...b, chev: openSet.has(row.path) ? 'i-hugeicons-arrow-down-01' : 'i-hugeicons-arrow-right-01', ico: { icon: folderIcon(openSet.has(row.path)), color: 'var(--mu)' }, base: [{ t: row.name!, color: 'var(--tx2)', w: 500 }], dir: [], c: null as Chg | null, stLetter: nch ? '●' : '', stColor: 'var(--amb)', stSize: '8px' }
    }
    const c = chg.value[row.path] || null
    const cut = row.path.lastIndexOf('/') + 1, bn = row.path.slice(cut), dn = row.path.slice(0, Math.max(0, cut - 1))
    const showDir = mode.value !== 'files' && !!dn
    const col = c ? SCc[c.st]! : 'var(--tx)'
    return {
      ...b,
      chev: '',
      ico: fileIcon(row.path),
      base: hiSegs(bn, cut, row.idx, col, 400),
      dir: showDir ? hiSegs(dn, 0, row.idx, 'var(--fa)', 400) : [],
      c,
      stLetter: c ? c.st : '',
      stColor: c ? SCc[c.st]! : 'transparent',
      stSize: '11px',
    }
  })
})

const summary = computed(() => {
  const ch = changes.value
  if (!ch.length) return 'Working tree clean'
  const A = ch.reduce((t, c) => t + c.a, 0), D = ch.reduce((t, c) => t + c.d, 0)
  return `${ch.length} changed · +${A} −${D}`
})

const branch = computed(() => {
  const fs = sessHere.value.find(s => s.id === fsid.value) || sessHere.value[0]
  return status.value?.branch || fs?.branch || repo.value?.branch || 'main'
})

const emptyText = computed(() => mode.value === 'search'
  ? `No files match "${q.value.trim()}"`
  : mode.value === 'changes'
    ? (onlySession.value ? 'This session hasn’t changed any files yet.' : 'Working tree clean. Nothing to commit.')
    : 'Empty repository')

// Segments (Seg needs a value; none is active while searching).
const tabModel = computed({
  get: () => (q.value.trim() ? '' : ex.value?.tab || 'files'),
  set: (v: string) => {
    if (ex.value && (v === 'changes' || v === 'files')) setTab(v)
  },
})
const tabItems = computed(() => [
  { label: 'Changes', value: 'changes', title: 'Tab switches', hint: changes.value.length },
  { label: 'Files', value: 'files', title: 'Tab switches', hint: allFiles.value.length },
])
const repoModel = computed({
  get: () => ex.value?.repoId || '',
  set: (id: string) => {
    if (ex.value && id !== ex.value.repoId) ui.openExplorer(ex.value.tab, id)
    refocus()
  },
})
const repoItems = computed(() => (proj.value?.repos || []).map(r => ({ label: r.label, value: r.id })))
const viewModel = computed({
  get: () => view.value,
  set: (v: 'diff' | 'file') => {
    view.value = v
    refocus()
  },
})
const viewItems = [{ label: 'Diff', value: 'diff' as const }, { label: 'File', value: 'file' as const }]

function setTab(t: 'changes' | 'files') {
  if (!ex.value) return
  ui.explorer = { ...ex.value, tab: t }
  q.value = ''
  sel.value = 0
  refocus()
}

function toggleFolder(path: string) {
  openDirs.value = openDirs.value.includes(path) ? openDirs.value.filter(o => o !== path) : [...openDirs.value, path]
}

function refocus() {
  nextTick(() => input.value?.inputRef?.focus())
}

async function toggleStage(c: GitChange) {
  const r = await (c.staged ? api.git.unstage(cwd.value, [c.p]) : api.git.stage(cwd.value, [c.p]))
  if (!r.ok) ui.toast({ title: c.staged ? 'Could not unstage' : 'Could not stage', body: r.error, error: true })
  await G.refresh(cwd.value)
  refocus()
}

function onAutoFocus(e: Event) {
  e.preventDefault()
  input.value?.inputRef?.focus()
}

// ---------- Preview ----------

const preview = shallowRef<Line[]>([])
let prevToken = 0
let prevTimer: ReturnType<typeof setTimeout> | undefined

const selChg = computed(() => (cur.value?.type === 'file' ? chg.value[cur.value.path] || null : null))
const diffMode = computed(() => !!selChg.value && view.value !== 'file')
const editingBy = computed(() => {
  const s = cur.value
  if (!s || s.type !== 'file') return null
  const ed = sessHere.value.find(x => x.editing === s.path)
  if (ed) return `Claude is editing this now · ${ed.title}`
  const c = chg.value[s.path]
  return c?.by ? `Edited by Claude · ${c.byTitle}` : null
})

function fileLines(txt: string): Line[] {
  const L = txt.replace(/\r\n/g, '\n').split('\n')
  if (L.length > 1 && L[L.length - 1] === '') L.pop()
  return L.map((t, k) => mkLine(k + 1, t))
}

async function fetchText(kind: 'diff' | 'file', c: string, path: string) {
  const key = `${kind}|${path}`
  const hit = cache.get(key)
  if (hit != null) return hit
  const txt = kind === 'diff' ? await api.git.diff(c, path) : await api.git.read(c, path)
  cache.set(key, txt)
  return txt
}

async function loadPreview() {
  const token = ++prevToken
  const s = cur.value, c = cwd.value
  if (!s || s.type !== 'file' || !c) {
    preview.value = []
    return
  }
  let lines: Line[] = []
  try {
    if (diffMode.value) {
      lines = parseDiff(await fetchText('diff', c, s.path))
      if (!lines.length) lines = fileLines(await fetchText('file', c, s.path))
    } else lines = fileLines(await fetchText('file', c, s.path))
  } catch (e: any) {
    lines = [mkHunk(String(e?.message || e))]
  }
  if (token !== prevToken) return
  preview.value = lines

  // Highlight each block of code (the file, or each diff hunk) as a unit, then swap the segments in.
  const lit = await highlightDiff(lines, s.path)
  if (token !== prevToken || !lit) return
  preview.value = [...lines]
}

watch(() => [cwd.value, cur.value?.type, cur.value?.path, diffMode.value, status.value?.at], (nv, ov) => {
  // Fresh git status means files may have changed on disk.
  if (ov && nv[4] !== ov[4]) cache.clear()
  clearTimeout(prevTimer)
  prevTimer = setTimeout(loadPreview, preview.value.length ? 50 : 0)
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(prevTimer))

const dirInfo = computed(() => {
  const s = cur.value
  if (!s || s.type !== 'dir') return null
  const inside = allFiles.value.filter(f => f.startsWith(s.path + '/')).length
  const nch = changes.value.filter(c => c.p.startsWith(s.path + '/'))
  return { path: s.path + '/', text: `${inside} files · ${nch.length} changed`, list: nch.map(c => ({ p: c.p.slice(s.path.length + 1), st: c.st, color: SCc[c.st]! })) }
})

// ---------- Actions ----------

const winPath = (path: string) => cwd.value.replace(/[\\/]$/, '') + '\\' + path.replace(/\//g, '\\')

async function openFile(path: string) {
  const p = proj.value
  if (!p) return
  const full = winPath(path)
  const res = await api.sys.openEditor(p.editor, cwd.value, full)
  if (res.ok) ui.toast({ title: `Opening ${path.split('/').pop()} in ${p.editor}`, body: full, hue: p.hue })
  else ui.toast({ title: `Could not open ${p.editor}`, body: res.error, error: true })
}

function copyPath(path: string) {
  const p = proj.value
  navigator.clipboard?.writeText(path).catch(() => {})
  ui.toast({ title: 'Path copied', body: path, hue: p?.hue })
}

function revealFile(path: string) {
  api.sys.showInFolder(winPath(path))
}

function mention(path: string) {
  if (repo.value) ui.mention(repo.value.id, path)
}

const isSel = computed(() => cur.value?.type === 'file')
function actOpen() { if (isSel.value) openFile(cur.value!.path) }
function actMention() { if (isSel.value) mention(cur.value!.path) }
function actCopy() { if (cur.value) copyPath(cur.value.path) }
function actReveal() { if (cur.value) revealFile(cur.value.path) }

/** The selected folder (a file's own folder), or the repo root when nothing is selected. */
const shellDir = computed(() => {
  const c = cur.value
  if (!c) return ''
  return c.type === 'dir' ? c.path : c.path.split('/').slice(0, -1).join('/')
})

/** Opens a plain shell in the shell panel, in the selected folder. */
function actShell() {
  if (!repo.value) return
  const dir = shellDir.value
  const cwdFull = dir ? winPath(dir) : cwd.value
  const repoId = repo.value.id
  ui.explorer = null
  ui.openShell(repoId, { cwd: cwdFull })
}

function clickRow(i: number, row: Row) {
  sel.value = i
  if (row.type === 'dir') toggleFolder(row.path)
}

function onKey(e: KeyboardEvent) {
  const n = rows.value.length, s = cur.value
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (n) sel.value = (si.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    setTab(ex.value?.tab === 'changes' ? 'files' : 'changes')
    return
  }
  if (e.ctrlKey && !e.altKey && e.code === 'KeyI') {
    e.preventDefault()
    if (s?.type === 'file') mention(s.path)
    return
  }
  if (e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
    e.preventDefault()
    toggleWrap()
    return
  }
  if (e.ctrlKey && e.altKey && e.code === 'KeyC') {
    e.preventDefault()
    if (s) copyPath(s.path)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (!s) return
    if (s.type === 'dir') toggleFolder(s.path)
    else openFile(s.path)
    return
  }
  if (mode.value === 'files' && s && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault()
    const isOpen = openDirs.value.includes(s.path)
    if (e.key === 'ArrowRight') {
      if (s.type === 'dir' && !isOpen) toggleFolder(s.path)
      else if (s.type === 'dir') sel.value = Math.min(n - 1, si.value + 1)
    } else if (s.type === 'dir' && isOpen) toggleFolder(s.path)
    else {
      const par = s.path.split('/').slice(0, -1).join('/'), pi = rows.value.findIndex(x => x.path === par)
      if (pi >= 0) sel.value = pi
    }
  }
}

function onInput() {
  sel.value = 0
}

// Keep the selected row in view.
watch(() => [si.value, q.value, ex.value?.tab, ex.value?.repoId], () => {
  nextTick(() => {
    const c = listEl.value
    const el = c?.querySelector<HTMLElement>('[data-exsel="1"]')
    if (!c || !el) return
    const t = el.offsetTop, b = t + el.offsetHeight
    if (t < c.scrollTop) c.scrollTop = Math.max(0, t - 6)
    else if (b > c.scrollTop + c.clientHeight) c.scrollTop = b - c.clientHeight + 6
  })
})

// ---------- Window size, tree width and wrapping (remembered in prefs) ----------

const prefs = usePrefsStore()
const { width: vw, height: vh } = useWindowSize()
const LAYOUT: ExplorerLayout = { tree: 0.42, w: 1120, h: 700, max: false, wrap: false }
const TOP = 28
const MIN_W = 560, MIN_H = 360
const lay = computed<ExplorerLayout>(() => ({ ...LAYOUT, ...prefs.prefs.explorer }))
const clamp = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)))

function setLay(p: Partial<ExplorerLayout>) {
  prefs.set({ explorer: { ...lay.value, ...p } })
}

/** Maximized fills the window below the title bar; otherwise the saved size, kept on screen. */
const box = computed(() => lay.value.max
  ? { w: vw.value - 16, h: vh.value - TOP - 8 }
  : { w: clamp(lay.value.w, MIN_W, vw.value - 32), h: clamp(lay.value.h, MIN_H, vh.value - TOP - 28) })

const contentProps = computed(() => ({
  onOpenAutoFocus: onAutoFocus,
  style: { width: box.value.w + 'px', height: box.value.h + 'px' },
}))

const toggleMax = () => setLay({ max: !lay.value.max })
const toggleWrap = () => setLay({ wrap: !lay.value.wrap })

/** Follows the pointer until release, with the given cursor shown everywhere meanwhile. */
function drag(e: MouseEvent, cursor: string, move: (dx: number, dy: number) => void) {
  e.preventDefault()
  const sx = e.clientX, sy = e.clientY
  const onMove = (ev: MouseEvent) => move(ev.clientX - sx, ev.clientY - sy)
  const up = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', up)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = cursor
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', up)
}

/** Drags an edge or corner. The window stays centred, so a side edge grows it by twice the pointer travel. */
function startResize(e: MouseEvent, sx: -1 | 0 | 1, sy: 0 | 1) {
  const from = { ...box.value }
  const cursor = sx && sy ? (sx > 0 ? 'nwse-resize' : 'nesw-resize') : sx ? 'ew-resize' : 'ns-resize'
  drag(e, cursor, (dx, dy) => setLay({
    max: false,
    w: clamp(from.w + dx * sx * 2, MIN_W, vw.value - 32),
    h: clamp(from.h + dy * sy, MIN_H, vh.value - TOP - 28),
  }))
}

const bodyEl = ref<HTMLElement | null>(null)
const TREE_MIN = 220, PREVIEW_MIN = 280

/** Drags the divider between the tree and the preview. */
function startSplit(e: MouseEvent) {
  const r = bodyEl.value?.getBoundingClientRect()
  if (!r) return
  const from = lay.value.tree * r.width
  drag(e, 'ew-resize', dx => setLay({ tree: Math.max(TREE_MIN, Math.min(r.width - PREVIEW_MIN, from + dx)) / r.width }))
}

const showPreview = computed(() => box.value.w >= 640)
const showHints = computed(() => box.value.w >= 980)

const actBtn = 'h-[26px] px-2.5 text-[11.5px] rounded-md'
const kbdCls = 'h-auto min-w-0 p-0 ring-0 bg-transparent normal-case font-normal text-[10px] text-(--fa) mono'
</script>

<template>
  <UModal
    v-model:open="open"
    :content="contentProps"
    :ui="{
      overlay: 'bg-(--ovl) z-[62]',
      content: 'z-[62] top-[28px] left-1/2 -translate-x-1/2 translate-y-0 max-w-none max-h-none sm:max-h-none flex flex-col overflow-hidden bg-(--modal) ring-0 border border-(--bb) rounded-xl shadow-(--shadow) divide-y-0 text-(--tx) text-[12px]',
    }"
  >
    <template #content>
      <!-- Drag an edge or corner to resize -->
      <template v-if="!lay.max">
        <div class="absolute inset-y-3 -left-[3px] z-10 w-[7px] cursor-ew-resize" @mousedown="startResize($event, -1, 0)" />
        <div class="absolute inset-y-3 -right-[3px] z-10 w-[7px] cursor-ew-resize" @mousedown="startResize($event, 1, 0)" />
        <div class="absolute inset-x-3 -bottom-[3px] z-10 h-[7px] cursor-ns-resize" @mousedown="startResize($event, 0, 1)" />
        <div class="absolute -bottom-[3px] -left-[3px] z-10 size-3 cursor-nesw-resize" @mousedown="startResize($event, -1, 1)" />
        <div class="absolute -right-[3px] -bottom-[3px] z-10 size-3 cursor-nwse-resize" @mousedown="startResize($event, 1, 1)" />
      </template>
      <template v-if="ex && proj && repo">
        <!-- Header: double-click to maximize or restore -->
        <div class="flex flex-wrap items-center gap-2.5 border-b border-(--ln) py-2.5 pr-2.5 pl-[14px]" @dblclick.self="toggleMax">
          <div class="size-2.5 flex-none rounded-sm" :style="{ background: `oklch(0.72 0.12 ${proj.hue})` }" />
          <span class="whitespace-nowrap text-[13px] font-semibold">{{ proj.name }}</span>
          <span v-if="proj.repos.length > 1" @mousedown.prevent>
            <Seg v-model="repoModel" :items="repoItems" size="md" mono />
          </span>
          <span class="mono whitespace-nowrap text-[11px] text-(--mu)"><UIcon name="i-hugeicons-git-branch" class="size-3 align-[-2px]" /> {{ branch }}</span>
          <span
            v-if="ex.wt"
            class="mono flex h-[18px] items-center whitespace-nowrap rounded-sm px-1.5 text-[10.5px] text-(--teal)"
            style="background: color-mix(in oklch, var(--teal) 15%, transparent)"
          ><UIcon name="i-hugeicons-git-fork" class="size-3 align-[-2px]" /> worktree</span>
          <span class="whitespace-nowrap text-[11.5px] text-(--fa)">{{ summary }}</span>
          <div class="flex-1" @dblclick="toggleMax" />
          <UButton
            color="neutral"
            variant="ghost"
            :title="lay.max ? 'Restore' : 'Maximize'"
            class="size-6 justify-center p-0 text-[12px] text-(--fa)"
            @mousedown.prevent
            @click="toggleMax"
          >
            <UIcon :name="lay.max ? 'i-hugeicons-minimize-screen' : 'i-hugeicons-maximize-screen'" class="size-3.5" />
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            title="Close (Esc)"
            class="size-6 justify-center p-0 text-[12px] text-(--fa)"
            @mousedown.prevent
            @click="open = false"
          >
            <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
          </UButton>
        </div>

        <!-- Search + tabs -->
        <div class="flex items-center gap-2.5 border-b border-(--ln) py-2 pr-3 pl-[14px]">
          <UIcon name="i-hugeicons-search-01" class="size-3.5 flex-none text-(--fa)" />
          <UInput
            ref="input"
            v-model="q"
            variant="none"
            placeholder="Search files by name, e.g. chkform"
            :ui="{ root: 'min-w-0 flex-1', base: 'h-[30px] rounded-none p-0 text-[13.5px] text-(--tx) placeholder:text-(--fa)' }"
            @update:model-value="onInput"
            @keydown="onKey"
          />
          <span @mousedown.prevent>
            <Seg v-model="tabModel" :items="tabItems" size="lg" />
          </span>
        </div>

        <!-- Body -->
        <div ref="bodyEl" class="flex min-h-0 flex-1">
          <div class="flex min-w-0 flex-none flex-col" :style="{ width: showPreview ? lay.tree * 100 + '%' : '100%' }">
            <UCheckbox
              v-if="mode === 'changes' && canOnly"
              v-model="onlySession"
              color="neutral"
              size="xs"
              label="Only files changed in this session"
              :ui="{ root: 'items-center cursor-pointer px-[14px] pt-2 pb-[2px]', base: 'size-[13px] rounded-sm ring-(--bb)', wrapper: 'ms-2', label: 'text-[12px] font-normal text-(--tx3) cursor-pointer' }"
              @mousedown.prevent
              @update:model-value="() => { sel = 0; refocus() }"
            />
            <div v-if="mode === 'search'" class="px-[14px] pt-2 pb-[2px] text-[11.5px] text-(--fa)">
              {{ rows.length }} match{{ rows.length === 1 ? '' : 'es' }} in all files
            </div>
            <div ref="listEl" class="relative min-h-0 flex-1 overflow-auto p-1.5">
              <div
                v-for="r in viewRows"
                :key="r.row.path"
                :data-exsel="r.sel ? '1' : '0'"
                class="relative flex h-[26px] cursor-pointer items-center gap-2 rounded-md pr-2"
                :class="r.sel ? 'bg-(--sel)' : 'hover:bg-(--hov)'"
                :style="{ paddingLeft: r.indent }"
                @mousedown.prevent
                @click="clickRow(r.i, r.row)"
                @dblclick="r.row.type === 'file' && openFile(r.row.path)"
              >
                <span v-for="(gd, k) in r.guides" :key="k" class="absolute top-0 bottom-0 w-px" :style="{ left: gd.left, background: gd.bg }" />
                <span class="w-2.5 flex-none text-(--fa)"><UIcon v-if="r.chev" :name="r.chev" class="size-2.5" /></span>
                <UIcon :name="r.ico.icon" class="size-3.5 flex-none" :style="{ color: r.ico.color }" />
                <span class="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap">
                  <span class="flex-none text-[12.5px]"><span v-for="(g, k) in r.base" :key="k" :style="{ color: g.color, fontWeight: g.w }">{{ g.t }}</span></span>
                  <span v-if="r.dir.length" class="mono min-w-0 overflow-hidden text-ellipsis text-[10.5px]"><span v-for="(g, k) in r.dir" :key="k" :style="{ color: g.color, fontWeight: g.w }">{{ g.t }}</span></span>
                </span>
                <UTooltip v-if="r.c" :text="r.c.staged ? 'Staged · click to unstage' : 'Click to stage'">
                  <span
                    class="grid size-4 flex-none place-items-center rounded-sm hover:bg-(--hov)"
                    :style="{ color: r.c.staged ? 'var(--grn)' : 'var(--fa)' }"
                    @click.stop="toggleStage(r.c)"
                  >
                    <UIcon :name="r.c.staged ? 'i-hugeicons-checkmark-square-02' : 'i-hugeicons-square'" class="size-3.5" />
                  </span>
                </UTooltip>
                <span
                  v-if="r.c?.by"
                  class="flex-none whitespace-nowrap text-[10.5px]"
                  :style="{ color: r.c.by === fsid ? 'var(--lnk)' : 'var(--mu)' }"
                >{{ r.c.by === fsid ? 'this session' : 'other session' }}</span>
                <template v-if="r.c && (r.c.a || r.c.d)">
                  <span class="mono flex-none text-[10.5px] text-(--grn)">+{{ r.c.a }}</span>
                  <span class="mono flex-none text-[10.5px] text-(--red)">−{{ r.c.d }}</span>
                </template>
                <span class="mono w-[14px] flex-none text-center font-bold" :style="{ fontSize: r.stSize, color: r.stColor }">{{ r.stLetter }}</span>
              </div>
              <div v-if="!rows.length" class="px-2.5 py-[18px] text-[12px] leading-normal text-(--fa)">
                {{ emptyText }}
              </div>
            </div>
            <GitCommitPanel v-if="mode === 'changes' && status?.isRepo" :cwd="cwd" :changes="changes" />
          </div>

          <!-- Drag to resize the tree; double-click to reset -->
          <div
            v-if="showPreview"
            class="group relative w-px flex-none cursor-ew-resize bg-(--ln)"
            title="Drag to resize"
            @mousedown="startSplit"
            @dblclick="setLay({ tree: LAYOUT.tree })"
          >
            <div class="absolute inset-y-0 -left-[3px] -right-[3px] group-hover:bg-(--lnk)/40" />
          </div>
          <div v-if="showPreview" class="flex min-w-0 flex-1 flex-col">
            <template v-if="cur && cur.type === 'file'">
              <div class="flex min-h-[24px] items-center gap-2.5 border-b border-(--ln2) py-2 pr-3 pl-[14px]">
                <span class="mono min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-(--tx2)">{{ cur.path }}</span>
                <UTooltip :text="lay.wrap ? 'Stop wrapping lines (Alt Z)' : 'Wrap lines (Alt Z)'">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    class="size-6 flex-none justify-center p-0"
                    :class="lay.wrap ? 'bg-(--sel) text-(--tx)' : 'text-(--fa)'"
                    :aria-pressed="lay.wrap"
                    @mousedown.prevent
                    @click="toggleWrap"
                  >
                    <UIcon name="i-hugeicons-text-wrap" class="size-3.5" />
                  </UButton>
                </UTooltip>
                <template v-if="selChg">
                  <span class="whitespace-nowrap text-[11px]" :style="{ color: SCc[selChg.st] }">{{ SLB[selChg.st] }}{{ selChg.staged ? ' · staged' : '' }}</span>
                  <span class="mono whitespace-nowrap text-[11px] text-(--mu)">+{{ selChg.a }} −{{ selChg.d }}</span>
                  <span @mousedown.prevent>
                    <Seg v-model="viewModel" :items="viewItems" size="sm" />
                  </span>
                </template>
              </div>
              <div v-if="editingBy" class="overflow-hidden text-ellipsis whitespace-nowrap border-b border-(--ln2) px-[14px] py-1.5 text-[11.5px] text-(--lnk)">
                {{ editingBy }}
              </div>
              <div class="mono min-h-0 flex-1 select-text overflow-auto bg-(--term) py-2 text-[12px] leading-[1.6]">
                <div v-for="(ln, k) in preview" :key="k" class="flex" :class="lay.wrap ? '' : 'min-w-max whitespace-pre'" :style="{ background: ln.bg }">
                  <span class="w-11 flex-none select-none pr-2.5 text-right text-(--fa)">{{ ln.n }}</span>
                  <span class="w-4 flex-none select-none" :style="{ color: ln.sc }">{{ ln.sign }}</span>
                  <span class="pr-4" :class="lay.wrap && 'min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere]'" :style="{ color: ln.tc }"><span v-for="(g, j) in ln.segs" :key="j" :style="{ color: g.color, fontStyle: g.fs }">{{ g.t }}</span></span>
                </div>
              </div>
            </template>
            <div v-else-if="dirInfo" class="flex flex-col gap-2.5 p-4">
              <span class="mono text-[12px] text-(--tx2)">{{ dirInfo.path }}</span>
              <span class="text-[12px] text-(--mu)">{{ dirInfo.text }}</span>
              <div v-for="dc in dirInfo.list" :key="dc.p" class="mono flex gap-2.5 text-[11.5px]">
                <span class="w-3 font-bold" :style="{ color: dc.color }">{{ dc.st }}</span>
                <span class="text-(--tx2)">{{ dc.p }}</span>
              </div>
            </div>
            <div v-else class="grid flex-1 place-items-center text-[12px] text-(--fa)">
              Select a file to preview it
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex flex-wrap items-center gap-[14px] border-t border-(--ln) py-2 pr-2.5 pl-[14px] text-[11px] text-(--fa)">
          <template v-if="showHints">
            <span>↑ ↓ move</span><span>Tab Changes / Files</span><span>← → folders</span><span>Alt Z wrap</span><span>Esc close</span>
          </template>
          <div class="flex-1" />
          <UTooltip :text="`Plain shell in ${shellDir || 'the repo folder'}`">
            <UButton color="neutral" variant="outline" size="xs" :class="[actBtn, 'gap-1.5']" icon="i-hugeicons-command-line" @mousedown.prevent @click="actShell">
              Open shell here
            </UButton>
          </UTooltip>
          <div class="flex items-center gap-1.5" :style="{ opacity: isSel ? 1 : 0.4 }">
            <UButton color="neutral" variant="outline" size="xs" :class="actBtn" title="Ctrl Alt C" @mousedown.prevent @click="actCopy">
              Copy path
            </UButton>
            <UButton color="neutral" variant="outline" size="xs" :class="actBtn" @mousedown.prevent @click="actReveal">
              Show in Explorer
            </UButton>
            <UButton color="neutral" variant="outline" size="xs" :class="[actBtn, 'gap-2']" title="Adds @path to the prompt you're typing" @mousedown.prevent @click="actMention">
              Mention in prompt<UKbd :class="kbdCls">Ctrl I</UKbd>
            </UButton>
            <UButton color="primary" variant="solid" size="xs" :class="[actBtn, 'gap-2']" @mousedown.prevent @click="actOpen">
              Open in {{ proj.editor }}<UKbd :class="[kbdCls, 'font-medium text-(--invtx) opacity-60']">Enter</UKbd>
            </UButton>
          </div>
        </div>
      </template>
    </template>
  </UModal>
</template>
