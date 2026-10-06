<script setup lang="ts">
import type { Editor, Project, Repo, RepoInfo } from '#shared/types'

interface Draft {
  pid: string | null
  name: string
  hue: number
  repos: Repo[]
  autoStart: boolean
  autoServices: boolean
  resume: boolean
  editor: Editor
}

const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const V = useServicesStore()
const prefs = usePrefsStore()

const EDITORS: Editor[] = ['VS Code', 'Cursor', 'PhpStorm', 'Zed']

const draft = ref<Draft | null>(null)
const tried = ref(false)
const drag = ref<number | null>(null)
/** Card that may start a drag: set on mousedown outside inputs and buttons, so text in fields stays selectable. */
const armed = ref<number | null>(null)
const nameInput = ref<any>(null)
const EDITOR_ITEMS = EDITORS.map(n => ({ label: n, value: n }))

const open = computed({
  get: () => ui.projectModal != null && draft.value != null,
  set: (v: boolean) => { if (!v) ui.projectModal = null },
})
const mode = computed(() => ui.projectModal?.mode || 'add')
const confirmDel = computed(() => mode.value === 'edit' && !!ui.projectModal?.confirmDel)

function emptyRepo(): Repo {
  return { id: uid('r'), label: '', path: '', cmd: prefs.prefs.startCmd || 'claude', stack: '', branch: '', services: [] }
}

watch(() => ui.projectModal, (m, prev) => {
  if (!m) {
    draft.value = null
    return
  }
  // Only rebuild when the modal opens or switches target, not on confirmDel toggles.
  if (prev && draft.value && prev.mode === m.mode && prev.pid === m.pid) return
  tried.value = false
  drag.value = null
  if (m.mode === 'edit') {
    const p = P.byId(m.pid)
    if (!p) {
      ui.projectModal = null
      return
    }
    draft.value = {
      pid: p.id, name: p.name, hue: p.hue,
      repos: p.repos.map(r => ({ ...r, services: (r.services || []).map(v => ({ ...v })) })),
      autoStart: p.autoStart, autoServices: !!p.autoServices, resume: p.resume, editor: p.editor,
    }
  } else {
    const used = P.projects.map(p => p.hue)
    const hue = HUES.find(h => !used.includes(h)) ?? 140
    draft.value = {
      pid: null, name: '', hue, repos: [emptyRepo()],
      autoStart: true, autoServices: true, resume: true, editor: prefs.prefs.editor,
    }
  }
}, { immediate: true })

// ---------- Git / stack check per repo ----------

const checks = ref<Record<string, { path: string; info: RepoInfo | null }>>({})
const timers = new Map<string, ReturnType<typeof setTimeout>>()

watch(() => (draft.value?.repos || []).map(r => r.id + '\n' + r.path.trim()).join('\n\n'), () => {
  for (const r of draft.value?.repos || []) {
    const path = r.path.trim()
    if (checks.value[r.id]?.path === path) continue
    clearTimeout(timers.get(r.id))
    if (!path || !isDesktop) {
      const { [r.id]: _, ...rest } = checks.value
      checks.value = rest
      continue
    }
    checks.value = { ...checks.value, [r.id]: { path, info: null } }
    timers.set(r.id, setTimeout(async () => {
      const info = await api.git.info(path).catch(() => null)
      if (checks.value[r.id]?.path === path) checks.value = { ...checks.value, [r.id]: { path, info } }
    }, 300))
  }
}, { immediate: true })

function infoOf(r: Repo): RepoInfo | null {
  const c = checks.value[r.id]
  return c && c.path === r.path.trim() ? c.info : null
}

function metaOf(r: Repo) {
  if (!r.path.trim()) return null
  const info = infoOf(r)
  if (info) {
    if (!info.exists) return { icon: 'i-hugeicons-alert-circle', color: 'var(--red)', t: 'Folder not found' }
    if (!info.isRepo) return { icon: 'i-hugeicons-alert-02', color: 'var(--amb)', t: 'No git repository in this folder' }
    return { icon: 'i-hugeicons-tick-02', color: 'var(--grn)', t: ['Git repo', info.branch, info.stack].filter(Boolean).join(' · ') }
  }
  if (r.stack) return { icon: 'i-hugeicons-tick-02', color: 'var(--grn)', t: `Git repo · ${r.branch || 'main'} · ${r.stack}` }
  return { icon: 'i-hugeicons-time-quarter-pass', color: 'var(--fa)', t: 'Checked when the session starts' }
}

// ---------- Validation ----------

const errors = computed(() => {
  const d = draft.value
  const e: { name?: string; general?: string; repos: Record<number, string>; any: boolean } = { repos: {}, any: false }
  if (!d) return e
  const nm = d.name.trim()
  if (!nm) e.name = 'Give the project a name'
  else if (P.projects.some(p => p.id !== d.pid && p.name.toLowerCase() === nm.toLowerCase())) e.name = 'Another project already uses this name'
  if (!d.repos.length) e.general = 'Add at least one repository'
  const seen: Record<string, 1> = {}
  d.repos.forEach((r, i) => {
    const l = r.label.trim().toLowerCase(), m: string[] = []
    if (!l) m.push('Add a label')
    else if (seen[l]) m.push('Labels must be unique')
    seen[l] = 1
    if (!r.path.trim()) m.push('Pick a folder')
    if (m.length) e.repos[i] = m.join(' · ')
  })
  e.any = !!(e.name || e.general || Object.keys(e.repos).length)
  return e
})

const nameErr = computed(() => (tried.value && errors.value.name) || undefined)

// ---------- Field handlers ----------

function setName(v: string) {
  draft.value!.name = v
}

function setPath(r: Repo, v: string) {
  r.path = v
  r.stack = ''
  r.branch = ''
}

async function browse(r: Repo) {
  const path = await api.sys.pickFolder()
  if (!path) return
  setPath(r, path)
  if (!r.label.trim()) r.label = guessLabel(path)
}

function addRepo() {
  draft.value!.repos.push(emptyRepo())
}

function removeRepo(i: number) {
  draft.value!.repos.splice(i, 1)
}

function addSvc(r: Repo) {
  r.services = [...(r.services || []), { id: uid('v'), cmd: '', port: '' }]
}

function removeSvc(r: Repo, k: number) {
  r.services = r.services.filter((_, q) => q !== k)
}

function orderLabel(i: number) {
  const n = draft.value!.repos.length
  return n > 1 ? (i === 0 ? 'Left pane' : i === 1 ? 'Right pane' : `Pane ${i + 1}`) : 'Only pane'
}

// ---------- Drag to reorder ----------

function arm(i: number, e: MouseEvent) {
  armed.value = (e.target as HTMLElement).closest('input, button') ? null : i
}

function dragStart(i: number, e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    try { e.dataTransfer.setData('text/plain', String(i)) } catch {}
  }
  drag.value = i
}

function drop(i: number) {
  const from = drag.value
  drag.value = null
  if (from == null || from === i || !draft.value) return
  const arr = [...draft.value.repos]
  const [it] = arr.splice(from, 1)
  arr.splice(i, 0, it!)
  draft.value.repos = arr
}

function dragEnd() {
  drag.value = null
  armed.value = null
}

// ---------- Save / delete ----------

const saveLabel = computed(() => {
  const d = draft.value
  if (!d) return ''
  if (mode.value !== 'add') return 'Save'
  const n = d.repos.length
  return d.autoStart ? `Create and start ${n} session${n === 1 ? '' : 's'}` : 'Create project'
})

async function save() {
  const d = draft.value
  if (!d || !ui.projectModal) return
  if (errors.value.any) {
    tried.value = true
    return
  }
  const repos: Repo[] = d.repos.map((r) => {
    const info = infoOf(r)
    return {
      id: r.id,
      label: r.label.trim(),
      path: r.path.trim(),
      cmd: (r.cmd || '').trim() || 'claude',
      stack: info?.stack || r.stack || '',
      branch: info?.branch || r.branch || 'main',
      services: (r.services || []).filter(v => (v.cmd || '').trim()).map(v => ({ id: v.id || uid('v'), cmd: v.cmd.trim(), port: String(v.port || '').replace(/[^0-9]/g, '') })),
    }
  })
  const fields = { name: d.name.trim(), hue: d.hue, repos, autoStart: d.autoStart, autoServices: d.autoServices, resume: d.resume, editor: d.editor }

  if (mode.value === 'add') {
    const p: Project = {
      id: uid('p'), ...fields,
      layout: repos.length > 1 && ui.width >= 900 ? 'split' : 'tabs',
      view: 'terminals', expanded: true, createdAt: Date.now(),
    }
    P.add(p)
    ui.projectModal = null
    P.sel = p.id
    if (p.autoStart) await ui.startAll(p.id)
    else ui.focusLater()
    return
  }

  const old = P.byId(d.pid)
  if (!old) {
    ui.projectModal = null
    return
  }
  const keep = new Set(repos.map(r => r.id))
  const added = repos.filter(r => !old.repos.some(o => o.id === r.id))
  const svcKeep = new Set(repos.flatMap(r => r.services.map(v => v.id)))
  V.ofProject(old).filter(v => !svcKeep.has(v.id)).forEach(v => V.forget(v.id))
  P.update(old.id, p => ({ ...p, ...fields }))
  S.sessions.filter(s => s.pid === old.id).filter(s => !keep.has(s.repoId)).forEach(s => S.close(s.id))
  ui.projectModal = null
  P.sel = old.id
  if (d.autoStart) {
    const p = P.byId(old.id)!
    for (const r of added) await S.start(p, r)
  }
  ui.focusLater()
}

function setConfirm(v: boolean) {
  if (ui.projectModal) ui.projectModal = { ...ui.projectModal, confirmDel: v }
}

function deleteProject() {
  const pid = draft.value?.pid
  const p = P.byId(pid)
  if (!p) return
  S.sessions.filter(s => s.pid === p.id).forEach(s => S.close(s.id))
  V.ofProject(p).forEach(v => V.forget(v.id))
  P.remove(p.id)
  ui.projectModal = null
  ui.focusLater()
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Enter' && e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    save()
  }
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true)
  timers.forEach(t => clearTimeout(t))
})

function focusName(e: Event) {
  e.preventDefault()
  nameInput.value?.inputRef?.focus()
}

const field = 'h-[30px] px-[9px] py-0 rounded-md bg-(--inp) ring ring-inset mono text-[12px]'
const svcField = 'h-7 py-0 rounded-md bg-(--inp) ring ring-inset ring-(--ln) mono text-[11.5px] text-(--tx2)'
const ring = (bad: boolean) => (bad ? 'ring-(--red)' : 'ring-(--ln)')
</script>

<template>
  <UModal
    v-model:open="open"
    scrollable
    :content="{ onOpenAutoFocus: focusName }"
    :ui="{
      overlay: 'bg-(--ovl) flex place-items-start items-start justify-center px-4 py-9 sm:py-9 z-[62]',
      content: 'w-full max-w-[640px] flex flex-col bg-(--modal) ring-0 border border-(--bb) rounded-xl shadow-(--shadow) divide-y-0 text-(--tx)',
    }"
  >
    <template #content>
      <UForm v-if="draft" :state="draft" class="flex flex-col" @submit="save">
        <div class="flex items-center justify-between border-b border-(--ln) px-5 py-4">
          <div class="flex flex-col gap-0.5">
            <span class="text-[15px] font-semibold">{{ mode === 'add' ? 'New project' : 'Edit project' }}</span>
            <span class="text-[12px] text-(--mu)">{{ mode === 'add' ? 'Each repo gets its own Claude Code terminal.' : 'Changes apply the next time a session starts.' }}</span>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            class="grid size-6 place-items-center rounded p-0 text-[12px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
            @click="open = false"
          >
            <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
          </UButton>
        </div>

        <div class="flex flex-col gap-[18px] px-5 py-[18px]">
          <div>
            <UFormField
              label="Name"
              name="name"
              :error="nameErr"
              :ui="{ label: 'text-[12px] font-normal text-(--tx3)', container: 'mt-1.5', error: 'mt-1.5 text-[11.5px] text-(--red)' }"
            >
              <UInput
                ref="nameInput"
                :model-value="draft.name"
                variant="none"
                placeholder="e.g. Acme Outdoors"
                class="w-full"
                :ui="{ base: ['h-8 px-2.5 py-0 rounded-md bg-(--inp) ring ring-inset text-[13px] text-(--tx)', ring(!!nameErr)] }"
                @update:model-value="setName(String($event))"
              />
            </UFormField>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-[12px] text-(--tx3)">Color</span>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="h in HUES"
                :key="h"
                type="button"
                class="size-[26px] cursor-pointer rounded-md"
                :style="{ background: pcol(h), boxShadow: h === draft.hue ? '0 0 0 2px var(--modal), 0 0 0 4px var(--tx)' : 'none' }"
                @click="draft.hue = h"
              />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
              <span class="text-[12px] text-(--tx3)">Repositories</span>
              <span class="text-[11.5px] text-(--fa)">Drag to set pane order, left to right</span>
            </div>

            <div
              v-for="(r, i) in draft.repos"
              :key="r.id"
              :draggable="armed === i"
              class="flex gap-2.5 rounded-lg border border-(--ln) bg-(--chrome) p-3"
              :style="{ opacity: drag === i ? 0.4 : 1 }"
              @mousedown="arm(i, $event)"
              @mouseup="armed = null"
              @dragstart="dragStart(i, $event)"
              @dragover.prevent
              @drop.prevent="drop(i)"
              @dragend="dragEnd"
            >
              <div title="Drag to reorder" class="w-2.5 cursor-grab pt-[7px] leading-none text-(--fa)"><UIcon name="i-hugeicons-drag-drop-vertical" class="size-3" /></div>
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <div class="grid grid-cols-[80px_minmax(0,1fr)_auto] gap-2">
                  <UInput
                    v-model="r.label"
                    variant="none"
                    placeholder="Label"
                    class="w-full"
                    :ui="{ base: [field, 'text-(--tx)', ring(tried && !!errors.repos[i] && !r.label.trim())] }"
                  />
                  <UInput
                    :model-value="r.path"
                    variant="none"
                    placeholder="C:\code\project"
                    class="w-full min-w-0"
                    :ui="{ base: [field, 'text-(--tx2)', ring(tried && !!errors.repos[i] && !r.path.trim())] }"
                    @update:model-value="setPath(r, String($event))"
                  />
                  <UButton
                    color="neutral"
                    variant="outline"
                    class="h-[30px] rounded-md bg-transparent px-3 py-0 text-[12px] font-normal text-(--tx2) ring-(--bb) hover:bg-(--hov)"
                    @click="browse(r)"
                  >
                    Browse…
                  </UButton>
                </div>

                <div class="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-2">
                  <span class="text-[11.5px] text-(--mu)">Startup</span>
                  <UInput v-model="r.cmd" variant="none" placeholder="claude" class="w-full" :ui="{ base: [field, 'text-(--tx2) ring-(--ln)'] }" />
                </div>

                <div class="grid grid-cols-[80px_minmax(0,1fr)] items-start gap-2">
                  <span class="pt-[7px] text-[11.5px] text-(--mu)">Dev servers</span>
                  <div class="flex flex-col gap-1.5">
                    <div v-for="(v, k) in r.services" :key="v.id" class="grid grid-cols-[minmax(0,1fr)_72px_20px] items-center gap-1.5">
                      <UInput v-model="v.cmd" variant="none" placeholder="npm run dev" class="w-full" :ui="{ base: [svcField, 'px-[9px]'] }" />
                      <UInput v-model="v.port" variant="none" placeholder="port" class="w-full" :ui="{ base: [svcField, 'px-2'] }" />
                      <UButton
                        color="neutral"
                        variant="ghost"
                        title="Remove"
                        class="grid size-5 place-items-center rounded p-0 text-[10px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
                        @click="removeSvc(r, k)"
                      >
                        <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
                      </UButton>
                    </div>
                    <UButton
                      color="neutral"
                      variant="link"
                      class="self-start p-0 pt-1 text-[11.5px] font-normal text-(--lnk) hover:text-(--lnk) hover:underline"
                      @click="addSvc(r)"
                    >
                      + Add dev server
                    </UButton>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-2 pl-[88px] text-[11.5px] text-(--mu)">
                  <template v-if="metaOf(r)">
                    <UIcon :name="metaOf(r)!.icon" class="size-3 flex-none" :style="{ color: metaOf(r)!.color }" />
                    <span>{{ metaOf(r)!.t }}</span>
                    <span class="text-(--fa)">·</span>
                  </template>
                  <span class="text-(--fa)">{{ orderLabel(i) }}</span>
                </div>
                <div v-if="tried && errors.repos[i]" class="pl-[88px] text-[11.5px] text-(--red)">{{ errors.repos[i] }}</div>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                title="Remove repository"
                class="mt-[5px] grid size-5 place-items-center rounded p-0 text-[11px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
                @click="removeRepo(i)"
              >
                <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
              </UButton>
            </div>

            <UButton
              color="neutral"
              variant="ghost"
              class="h-[34px] justify-center gap-1.5 rounded-lg border border-dashed border-(--bb) text-[12px] font-normal text-(--tx3) hover:border-(--mu) hover:bg-transparent hover:text-(--tx)"
              @click="addRepo"
            >
              + Add repository
            </UButton>
            <span v-if="tried && errors.general" class="text-[11.5px] text-(--red)">{{ errors.general }}</span>
          </div>

          <div class="flex flex-col gap-2.5">
            <UCheckbox
              v-model="draft.autoStart"
              color="neutral"
              size="sm"
              label="Start all sessions when I open this project"
              :ui="{ root: 'items-center cursor-pointer', base: 'rounded-sm ring-(--bb)', wrapper: 'ms-[9px]', label: 'text-[12.5px] font-normal text-(--tx) cursor-pointer' }"
            />
            <UCheckbox
              v-model="draft.autoServices"
              color="neutral"
              size="sm"
              label="Start dev servers with the sessions"
              :ui="{ root: 'items-center cursor-pointer', base: 'rounded-sm ring-(--bb)', wrapper: 'ms-[9px]', label: 'text-[12.5px] font-normal text-(--tx) cursor-pointer' }"
            />
            <UCheckbox
              v-model="draft.resume"
              color="neutral"
              size="sm"
              :ui="{ root: 'items-center cursor-pointer', base: 'rounded-sm ring-(--bb)', wrapper: 'ms-[9px]', label: 'text-[12.5px] font-normal text-(--tx) cursor-pointer' }"
            >
              <template #label>
                After restarting the app, resume with <span class="mono text-[11.5px] text-(--tx2)">claude --continue</span>
              </template>
            </UCheckbox>
            <div class="flex items-center gap-2.5 text-[12.5px]">
              <span class="text-(--tx3)">Editor</span>
              <Seg v-model="draft.editor" :items="EDITOR_ITEMS" />
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 border-t border-(--ln) px-5 py-3.5">
          <UButton
            v-if="mode === 'edit' && !confirmDel"
            color="neutral"
            variant="link"
            class="p-0 text-[12px] font-normal text-(--red) hover:text-(--red)"
            @click="setConfirm(true)"
          >
            Delete project
          </UButton>
          <div v-if="confirmDel" class="flex items-center gap-2 text-[12px]">
            <span class="text-(--tx2)">Delete {{ draft.name || 'this project' }} and close its sessions?</span>
            <UButton
              color="error"
              variant="solid"
              class="h-[26px] rounded-md bg-(--red) px-2.5 py-0 text-[12px] font-semibold text-white hover:bg-(--red) hover:opacity-90"
              @click="deleteProject"
            >
              Delete
            </UButton>
            <UButton color="neutral" variant="link" class="p-0 text-[12px] font-normal text-(--mu) hover:text-(--tx)" @click="setConfirm(false)">
              Keep
            </UButton>
          </div>
          <div class="flex-1" />
          <span v-if="tried && errors.any" class="text-[11.5px] text-(--red)">Fix the highlighted fields</span>
          <UButton
            color="neutral"
            variant="outline"
            class="h-[30px] rounded-md bg-transparent px-3.5 py-0 text-[12px] font-normal text-(--tx2) ring-(--bb) hover:bg-(--hov)"
            @click="open = false"
          >
            Cancel
          </UButton>
          <UButton
            color="neutral"
            variant="solid"
            class="h-[30px] gap-2.5 rounded-md bg-(--inv) px-3.5 py-0 text-[12px] font-semibold text-(--invtx) hover:bg-(--inv) hover:opacity-90"
            @click="save"
          >
            {{ saveLabel }}<span class="mono text-[10.5px] font-medium opacity-55">Ctrl Enter</span>
          </UButton>
        </div>
      </UForm>
    </template>
  </UModal>
</template>
