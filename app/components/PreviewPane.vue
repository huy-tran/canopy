<script setup lang="ts">
// Lookout: your running app beside the chat, in a webview, with tools that hand Claude exactly what you are looking at:
// Select element (one or several, with a note that can send the prompt), Draw annotations, a screenshot, and a Diagnose bar
// for console errors and failed requests. One pane per project, kept alive while another project shows.
import { CANCEL_PICK_SCRIPT, PICK_SCRIPT, describePick, type PickedElement } from '~/utils/previewPicker'

/** What the webview element offers, of the part of Electron's API used here. */
interface Webview extends HTMLElement {
  loadURL(url: string): Promise<void>
  getURL(): string
  reload(): void
  stop(): void
  goBack(): void
  goForward(): void
  canGoBack(): boolean
  canGoForward(): boolean
  focus(): void
  executeJavaScript(code: string): Promise<unknown>
  getWebContentsId(): number
}

const props = defineProps<{ pid: string; shown: boolean }>()

const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const V = useServicesStore()
const prefs = usePrefsStore()

const PARTITION = 'persist:canopy-preview'
/** Does the page hot-reload by itself (a vite, webpack or Next client is loaded)? Then reloading after Claude's edits is not needed. */
const HMR_SCRIPT = `!!document.querySelector('script[src*="@vite/client"],script[src*="webpack-dev-server"],script[src*="/_next/static/chunks/webpack"]') || !!window.__vite_plugin_react_preamble_installed__`

const DEVICES = [
  { id: 'fit', label: 'Fit the pane', icon: 'i-hugeicons-fullscreen', w: 0, h: 0 },
  { id: 'phone', label: 'Phone, 390 x 844', icon: 'i-hugeicons-smart-phone-01', w: 390, h: 844 },
  { id: 'tablet', label: 'Tablet, 820 x 1180', icon: 'i-hugeicons-tablet-02', w: 820, h: 1180 },
  { id: 'laptop', label: 'Laptop, 1280 x 800', icon: 'i-hugeicons-laptop', w: 1280, h: 800 },
]

interface Pick { el: PickedElement; img: File | null }
interface Issue { level: 'error' | 'warn'; text: string; source: string; page?: boolean; at: number }

const wv = ref<Webview>()
const root = ref<HTMLElement>()
const state = computed(() => ui.previews[props.pid])
const project = computed(() => P.byId(props.pid))
/** The address the webview is created with; later moves go through loadURL, so the page is not reloaded by state changes. */
const boot = ref(state.value?.url || '')
const ready = ref(false)
const loading = ref(false)
const addr = ref(state.value?.url || '')
const canBack = ref(false)
const canFwd = ref(false)
const failed = ref<string | null>(null)
const picking = ref(false)
const picks = ref<Pick[]>([])
const note = ref('')
const annot = ref<string | null>(null)
const issue = ref<Issue | null>(null)
const dragging = ref(false)
const busy = ref(false)
const hmr = ref(false)

const services = computed(() => V.ofProject(project.value).filter(v => v.port))
const portOf = (u: string) => { try { return new URL(u).port } catch { return '' } }
/** The dev server the page belongs to: the one on its port (set, or the one it moved to), else the first with a port. */
const svc = computed(() => services.value.find(v => v.port === portOf(addr.value) || V.portOf(v) === portOf(addr.value)) || services.value[0] || null)
const svcState = computed(() => (svc.value ? V.status(svc.value.id) : 'stopped'))

const dev = computed(() => DEVICES.find(d => d.id === state.value?.device) || DEVICES[0]!)
const frameStyle = computed(() => {
  const d = dev.value
  if (!d.w) return { width: '100%', height: '100%' }
  const land = !!state.value?.landscape
  return { width: (land ? d.h : d.w) + 'px', height: (land ? d.w : d.h) + 'px', flex: 'none', margin: 'auto' }
})
const refreshOn = computed(() => state.value?.refresh ?? !hmr.value)

/** What was typed becomes an address: "3000" and "localhost:3000" are the local site, "magpie.test" an http site. */
function normalise(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (/^\d{2,5}$/.test(t)) return `http://localhost:${t}`
  const u = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `http://${t}`
  try {
    const p = new URL(u)
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null
  } catch {
    return null
  }
}

function go(raw: string) {
  const u = normalise(raw)
  if (!u) return
  failed.value = null
  addr.value = u
  ui.setPreview({ url: u }, props.pid)
  if (!boot.value) boot.value = u
  else if (wv.value) {
    // Before the page has been scripted (a first load that failed), the address is moved with the attribute.
    if (ready.value) wv.value.loadURL(u).catch(() => undefined)
    else wv.value.setAttribute('src', u)
  }
}

function startServer(v = svc.value) {
  if (v && V.status(v.id) === 'stopped') V.start(v, v.repo)
}

/** Every server of the repo that has a port runs, so a Laravel app's vite assets come with its PHP server. */
function startRepoServers() {
  const s = svc.value
  if (s) for (const v of services.value.filter(x => x.repo.id === s.repo.id)) startServer(v)
}

/** A project with no dev server set up gets the one it runs (Laravel, Nuxt, Vite...), read from its files, added to its repo. */
async function detectServers() {
  const p = project.value
  if (!p || services.value.length) return
  for (const r of p.repos) {
    const found = await api.svc.detect(r.path).catch(() => [])
    const fresh = found.filter(d => !(r.services || []).some(v => v.cmd === d.cmd))
    if (!fresh.length) continue
    P.update(p.id, q => ({ ...q, repos: q.repos.map(rr => (rr.id === r.id ? { ...rr, services: [...(rr.services || []), ...fresh.map(d => ({ id: uid('v'), cmd: d.cmd, port: d.port }))] } : rr)) }))
  }
}

let offRequest: (() => void) | undefined
onMounted(async () => {
  offRequest = api.sys.onPreviewRequest(onRequest)
  await detectServers()
  if (!svc.value) return
  startRepoServers()
  if (!boot.value && svcState.value === 'running') go(`http://localhost:${V.portOf(svc.value)}`)
})
onBeforeUnmount(() => {
  offRequest?.()
  closeAnnot()
})

// Closing Lookout leaves its server running; opening it again starts it if it was stopped.
watch(() => props.shown, (s) => { if (s) startRepoServers() })

watch(svcState, (s) => {
  if (s !== 'running' || !svc.value) return
  if (!boot.value) go(`http://localhost:${V.portOf(svc.value)}`)
  else if (failed.value) go(addr.value)
})

// A server whose port was taken moves to the next free one and says so in its output: follow it.
watch(() => (svc.value ? V.portOf(svc.value) : ''), (p, old) => {
  const s = svc.value
  if (!p || p === old || !s) return
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(addr.value)
  if (!boot.value || failed.value || (local && portOf(addr.value) === (old || s.port))) go(`http://localhost:${p}`)
})

// Reload when Claude finishes a turn, for pages that do not hot-reload.
let wasWorking = false
watch(() => S.claudeOf(props.pid).some(s => s.status === 'working'), (now) => {
  if (wasWorking && !now && refreshOn.value && ready.value) setTimeout(() => wv.value?.reload(), 700)
  wasWorking = now
}, { immediate: true })

// ---------- Page events ----------

function syncNav() {
  const w = wv.value
  if (!w || !ready.value) return
  canBack.value = w.canGoBack()
  canFwd.value = w.canGoForward()
}
async function onReady() {
  ready.value = true
  syncNav()
  hmr.value = !!(await wv.value?.executeJavaScript(HMR_SCRIPT).catch(() => false))
}
function onNavigate(e: Event & { url: string; isMainFrame?: boolean }) {
  if (e.isMainFrame === false) return
  addr.value = e.url
  ui.setPreview({ url: e.url }, props.pid)
  // A server error page arrives just before this; its bar stays.
  if (!issue.value || Date.now() - issue.value.at > 1500) issue.value = null
  failed.value = null
  syncNav()
}
function onFail(e: Event & { errorCode: number; errorDescription: string; isMainFrame: boolean }) {
  // -3 is a navigation that was cancelled by another one.
  if (!e.isMainFrame || e.errorCode === -3) return
  failed.value = e.errorCode === -102 ? 'Nothing is answering at this address.' : e.errorDescription || 'The page failed to load.'
}
function onConsole(e: Event & { level: number; message: string; line: number; sourceId: string }) {
  const vueWarn = e.message.startsWith('[Vue warn]')
  if (e.level < 2 && !vueWarn) return
  if (/favicon|ERR_BLOCKED_BY_CLIENT|Electron Security Warning/.test(e.message)) return
  issue.value = { level: e.level >= 2 ? 'error' : 'warn', text: (e.message.split('\n')[0] ?? '').slice(0, 400), source: e.sourceId ? `${e.sourceId}:${e.line}` : '', at: Date.now() }
}
/** A request of this page came back failed (a 500, a call that errored): it gets the same bar as a console error. */
function onRequest(r: { wc?: number; url: string; method: string; type: string; status: number; error?: string }) {
  const w = wv.value
  if (!w || !ready.value || r.wc !== w.getWebContentsId()) return
  let path = r.url
  try {
    const u = new URL(r.url)
    path = u.pathname + u.search
  } catch { /* keep the whole address */ }
  const text = `${r.method} ${path.slice(0, 160)} ${r.status ? `returned ${r.status}` : `failed: ${r.error}`}`
  issue.value = { level: 'error', text, source: '', page: r.type === 'mainFrame', at: Date.now() }
}

// ---------- Tools ----------

/** The webview, once its page can be scripted. */
function guest() {
  return ready.value && wv.value ? wv.value : null
}

function fileOf(bytes: Uint8Array, label: string) {
  return new File([bytes as BlobPart], `lookout-${label}-${Date.now().toString(36)}.png`, { type: 'image/png' })
}

/** A picture of just the picked element, with a little around it. */
async function crop(w: Webview, el: PickedElement) {
  const r = el.rect
  if (r.width <= 2 || r.height <= 2) return null
  const pad = 8
  const rect = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.width + pad * 2, height: r.height + pad * 2 }
  const bytes = await api.sys.capturePreview(w.getWebContentsId(), rect).catch(() => null)
  return bytes?.length ? fileOf(bytes, 'element') : null
}

/** Picks an element; with Shift held on the click it carries straight on to the next, so several can be gathered. */
async function pick() {
  const w = guest()
  if (!w) return
  if (picking.value) {
    await w.executeJavaScript(CANCEL_PICK_SCRIPT).catch(() => undefined)
    return
  }
  annot.value = null
  picking.value = true
  w.focus()
  try {
    for (let more = true; more;) {
      const el = await w.executeJavaScript(PICK_SCRIPT) as PickedElement | null
      if (!el) break
      picks.value = [...picks.value, { el, img: await crop(w, el) }]
      more = !!el.more
    }
  } catch {
    // The page navigated away mid-pick.
  } finally {
    picking.value = false
  }
}

function dropPick(i: number) {
  picks.value = picks.value.filter((_, j) => j !== i)
}

function clearPicks() {
  picks.value = []
  note.value = ''
}

/** Sends what was picked, with the note; `submit` also presses Enter at Claude's prompt. */
async function sendPicks(submit: boolean) {
  const list = picks.value
  if (!list.length || busy.value) return
  busy.value = true
  try {
    const text = list.map((p, i) => describePick(p.el, i + 1, list.length)).join('\n')
    const ok = await ui.sendToClaude(text, list.flatMap(p => (p.img ? [p.img] : [])), { after: note.value, submit })
    if (ok) clearPicks()
  } finally {
    busy.value = false
  }
}

async function annotate() {
  const w = guest()
  if (!w || busy.value) return
  if (picking.value) await w.executeJavaScript(CANCEL_PICK_SCRIPT).catch(() => undefined)
  busy.value = true
  try {
    const bytes = await api.sys.capturePreview(w.getWebContentsId())
    annot.value = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }))
  } catch {
    ui.toast({ title: 'Could not capture the page', error: true })
  } finally {
    busy.value = false
  }
}

function closeAnnot() {
  if (annot.value) URL.revokeObjectURL(annot.value)
  annot.value = null
}

async function sendAnnotated(blob: Blob, text: string) {
  const file = new File([blob], `lookout-annotated-${Date.now().toString(36)}.png`, { type: 'image/png' })
  const ok = await ui.sendToClaude(
    `[Lookout annotations] ${addr.value}\nThe attached screenshot is my Lookout view with markings on it (numbered boxes, arrows, lines and labels; blurred areas are private).\n`,
    [file],
    { after: text, submit: !!text.trim() },
  )
  if (ok) closeAnnot()
}

async function sendShot() {
  const w = guest()
  if (!w || busy.value) return
  busy.value = true
  try {
    const bytes = await api.sys.capturePreview(w.getWebContentsId())
    await ui.sendToClaude(`[Lookout screenshot] ${addr.value}\n`, [fileOf(bytes, 'page')])
  } catch {
    ui.toast({ title: 'Could not capture the page', error: true })
  } finally {
    busy.value = false
  }
}

async function diagnose() {
  const i = issue.value
  if (!i) return
  // A server error page says what went wrong (Laravel's names the exception): send what it shows.
  const w = guest()
  const body = i.page && w ? await w.executeJavaScript('document.title + "\\n" + document.body.innerText.slice(0, 1800)').catch(() => '') as string : ''
  ui.sendToClaude(`[Lookout ${i.level}] ${addr.value}\n${i.text}\n${i.source ? `at ${i.source}\n` : ''}${body ? `The page shows:\n${body}\n` : ''}Please diagnose this.\n`)
  issue.value = null
}

function setDevice(id: string) {
  ui.setPreview({ device: id, landscape: id === 'fit' ? false : state.value?.landscape }, props.pid)
}

// ---------- Resize ----------

function startResize(e: PointerEvent) {
  e.preventDefault()
  const box = root.value?.parentElement?.getBoundingClientRect()
  if (!box) return
  dragging.value = true
  const move = (ev: PointerEvent) => ui.setPreview({ ratio: (box.right - ev.clientX) / box.width }, props.pid)
  const up = () => {
    dragging.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    document.body.style.cursor = ''
  }
  document.body.style.cursor = 'ew-resize'
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

const iconBtn = 'grid size-7 flex-none cursor-pointer place-items-center rounded-md text-[14px] text-(--mu) hover:bg-(--hov) hover:text-(--tx) disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent'
const tool = 'grid size-8 cursor-pointer place-items-center rounded-lg text-[16px] hover:bg-(--hov) disabled:cursor-default disabled:opacity-40'
const small = 'grid size-7 cursor-pointer place-items-center rounded-md text-[14px] hover:bg-(--hov)'
</script>

<template>
  <div
    ref="root"
    :class="shown ? 'relative flex min-h-0 min-w-0 flex-none flex-col border-l border-(--ln) bg-(--term)' : 'pointer-events-none invisible absolute size-px overflow-hidden'"
    :style="shown ? { width: ui.previewRatio * 100 + '%', maxWidth: 'calc(100% - 300px)' } : undefined"
  >
    <div v-if="shown" class="absolute inset-y-0 -left-[3px] z-30 w-1.5 cursor-ew-resize hover:bg-(--bb)" @pointerdown="startResize" />
    <div v-if="dragging" class="fixed inset-0 z-50 cursor-ew-resize" />

    <div class="flex h-10 flex-none items-center gap-1 border-b border-(--ln) bg-(--head) px-2">
      <button :class="iconBtn" :disabled="!canBack" title="Back" @click="wv?.goBack()"><UIcon name="i-hugeicons-arrow-left-02" /></button>
      <button :class="iconBtn" :disabled="!canFwd" title="Forward" @click="wv?.goForward()"><UIcon name="i-hugeicons-arrow-right-02" /></button>
      <button :class="iconBtn" :disabled="!ready" :title="loading ? 'Stop' : 'Reload'" @click="loading ? wv?.stop() : wv?.reload()">
        <UIcon :name="loading ? 'i-hugeicons-cancel-01' : 'i-hugeicons-refresh'" />
      </button>
      <input
        v-model="addr"
        spellcheck="false"
        placeholder="localhost:3000 or magpie.test"
        class="mono h-7 min-w-0 flex-1 rounded-md border border-(--ln) bg-(--chrome) px-2.5 text-[11.5px] text-(--tx) outline-none focus:border-(--bb)"
        @keydown.enter="go(addr)"
        @focus="($event.target as HTMLInputElement).select()"
      >
      <UTooltip :text="refreshOn ? 'Reloads when Claude finishes a turn (click to turn off)' : 'Reload when Claude finishes a turn (click to turn on)'">
        <button :class="[iconBtn, refreshOn ? 'bg-(--lnk)/15 text-(--lnk)' : '']" @click="ui.setPreview({ refresh: !refreshOn }, pid)"><UIcon name="i-hugeicons-flash" /></button>
      </UTooltip>
      <UTooltip :text="ui.lookoutWide ? `Back to normal (${prefs.kl('lookoutWide')})` : `Widest, with the project list folded (${prefs.kl('lookoutWide')})`">
        <button :class="iconBtn" @click="ui.toggleLookoutWide()"><UIcon :name="ui.lookoutWide ? 'i-hugeicons-minimize-screen' : 'i-hugeicons-maximize-screen'" /></button>
      </UTooltip>
      <button :class="iconBtn" :disabled="!addr" title="Open in the browser" @click="api.sys.openExternal(addr)"><UIcon name="i-hugeicons-link-square-02" /></button>
      <button :class="iconBtn" :title="`Close Lookout (${prefs.kl('preview')})`" @click="ui.setPreview({ open: false }, pid)"><UIcon name="i-hugeicons-cancel-01" /></button>
    </div>

    <div class="relative min-h-0 flex-1" :class="dev.w ? 'bg-(--term)' : 'bg-white'">
      <div v-if="loading" class="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-(--lnk)" />

      <div class="absolute inset-0 flex overflow-auto" :class="dev.w ? 'p-4' : ''">
        <div class="relative bg-white" :class="dev.w ? 'overflow-hidden rounded-xl shadow-2xl ring-1 ring-(--bb)' : ''" :style="frameStyle">
          <webview
            v-if="boot && isDesktop"
            ref="wv"
            :src="boot"
            :partition="PARTITION"
            class="absolute inset-0 size-full"
            :style="{ pointerEvents: dragging ? 'none' : 'auto' }"
            @dom-ready="onReady"
            @did-start-loading="loading = true"
            @did-stop-loading="loading = false; syncNav()"
            @did-navigate="onNavigate"
            @did-navigate-in-page="onNavigate"
            @did-fail-load="onFail"
            @console-message="onConsole"
          />
          <PreviewAnnotate v-if="annot" :src="annot" @send="sendAnnotated" @cancel="closeAnnot" />
        </div>
      </div>

      <div v-if="!isDesktop" class="absolute inset-0 grid place-items-center bg-(--term) p-6 text-center text-[12.5px] text-(--mu)">Lookout needs the desktop app.</div>

      <div v-else-if="!boot || failed" class="absolute inset-0 z-10 grid place-items-center overflow-auto bg-(--term) p-6">
        <div class="flex w-full max-w-[360px] flex-col items-center gap-3 text-center">
          <UIcon name="i-hugeicons-browser" class="size-6 text-(--fa)" />
          <div class="text-[13px] font-semibold">{{ failed ? 'Cannot show the page' : 'Lookout' }}</div>
          <div class="text-[12px] leading-normal text-(--mu)">
            {{ failed || (svc ? 'Start the dev server to see your app here, or type an address above.' : 'Canopy found no dev server to run for this project. Type the address of your app above, such as localhost:3000 or magpie.test.') }}
          </div>
          <UButton
            v-if="svc && svcState !== 'running'"
            color="primary"
            size="sm"
            :loading="svcState === 'starting'"
            :label="svcState === 'starting' ? 'Starting…' : `Start ${svc.cmd}`"
            @click="startServer()"
          />
          <UButton v-else-if="failed" color="neutral" variant="outline" size="sm" label="Try again" @click="go(addr)" />
          <div v-if="services.length > 1" class="flex flex-wrap justify-center gap-1.5">
            <UButton v-for="v in services" :key="v.id" color="neutral" variant="outline" size="xs" :label="`:${V.portOf(v)}`" @click="startServer(v); go(`localhost:${V.portOf(v)}`)" />
          </div>
        </div>
      </div>

      <div v-if="issue && !annot && !picks.length" class="absolute inset-x-3 bottom-16 z-10 flex items-center gap-2 rounded-lg border bg-(--chrome) p-2 shadow-lg" :style="{ borderColor: issue.level === 'error' ? 'var(--red)' : 'var(--amb)' }">
        <span class="mono grid h-5 flex-none place-items-center rounded px-1.5 text-[10px] font-bold text-black" :style="{ background: issue.level === 'error' ? 'var(--red)' : 'var(--amb)' }">{{ issue.level === 'error' ? 'ERR' : 'WARN' }}</span>
        <span class="mono ellipsis min-w-0 flex-1 text-[11px] text-(--tx2)" :title="issue.text">{{ issue.text }}</span>
        <UButton color="neutral" variant="outline" size="xs" label="Diagnose" class="flex-none" @click="diagnose" />
        <button class="grid size-5 flex-none cursor-pointer place-items-center rounded text-(--mu) hover:bg-(--hov)" @click="issue = null"><UIcon name="i-hugeicons-cancel-01" /></button>
      </div>

      <div v-if="picks.length && !annot" class="absolute inset-x-3 bottom-3.5 z-10 mx-auto flex max-w-[560px] flex-col gap-1.5 rounded-xl border border-(--bb) bg-(--chrome) p-2 shadow-xl">
        <div class="flex flex-wrap gap-1">
          <span v-for="(p, i) in picks" :key="i" class="mono flex h-6 max-w-full items-center gap-1 rounded-md bg-(--chip) pl-1.5 pr-0.5 text-[10.5px] text-(--tx2)">
            <span class="grid size-4 flex-none place-items-center rounded-full bg-(--lnk) text-[9px] font-bold text-black">{{ i + 1 }}</span>
            <span class="ellipsis" :title="p.el.selector">{{ p.el.selector.split(' > ').pop() }}</span>
            <button class="grid size-5 flex-none cursor-pointer place-items-center rounded text-(--mu) hover:bg-(--hov)" @click="dropPick(i)"><UIcon name="i-hugeicons-cancel-01" class="size-3" /></button>
          </span>
        </div>
        <textarea
          v-model="note"
          rows="2"
          autofocus
          placeholder="Tell Claude what to change (Enter sends it as a prompt)"
          class="resize-none rounded-md border border-(--ln) bg-(--term) px-2.5 py-1.5 text-[12px] text-(--tx) outline-none focus:border-(--bb)"
          @keydown.enter.exact.prevent="sendPicks(true)"
          @keydown.esc.prevent="clearPicks"
        />
        <div class="flex items-center gap-1.5">
          <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-select-02" :label="picking ? 'Picking… (Esc stops)' : 'Pick another'" @click="pick" />
          <span class="text-[10.5px] text-(--fa)">Shift-click picks several.</span>
          <div class="flex-1" />
          <UButton color="neutral" variant="ghost" size="xs" label="Cancel" @click="clearPicks" />
          <UButton color="neutral" variant="outline" size="xs" label="Add to prompt" :disabled="busy" @click="sendPicks(false)" />
          <UButton color="primary" size="xs" icon="i-hugeicons-sent" label="Send" :disabled="busy" @click="sendPicks(true)" />
        </div>
      </div>

      <div v-else-if="ready && !annot && !failed" class="absolute bottom-3.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-(--bb) bg-(--chrome) p-1 shadow-xl">
        <UTooltip :text="picking ? 'Stop selecting (Esc)' : 'Select an element to show Claude (Shift-click picks several)'">
          <button :class="[tool, picking ? 'bg-(--lnk)/20 text-(--lnk)' : 'text-(--tx2)']" @click="pick"><UIcon name="i-hugeicons-select-02" /></button>
        </UTooltip>
        <UTooltip text="Draw annotations on the page">
          <button :class="[tool, 'text-(--tx2)']" :disabled="busy" @click="annotate"><UIcon name="i-hugeicons-pencil-edit-01" /></button>
        </UTooltip>
        <UTooltip text="Send a screenshot of the page">
          <button :class="[tool, 'text-(--tx2)']" :disabled="busy" @click="sendShot"><UIcon name="i-hugeicons-image-01" /></button>
        </UTooltip>
        <span class="mx-1 h-5 w-px bg-(--ln)" />
        <UTooltip v-for="d in DEVICES" :key="d.id" :text="d.label">
          <button :class="[small, dev.id === d.id ? 'bg-(--hov) text-(--tx)' : 'text-(--mu)']" @click="setDevice(d.id)"><UIcon :name="d.icon" /></button>
        </UTooltip>
        <UTooltip v-if="dev.w" text="Rotate">
          <button :class="[small, state?.landscape ? 'bg-(--hov) text-(--tx)' : 'text-(--mu)']" @click="ui.setPreview({ landscape: !state?.landscape }, pid)"><UIcon name="i-hugeicons-rotate-clockwise" /></button>
        </UTooltip>
      </div>
    </div>
  </div>
</template>
