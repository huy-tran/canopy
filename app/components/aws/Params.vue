<script setup lang="ts">
// Parameter Store: parameters, a value (secure ones masked until revealed, and masked again after
// 30 seconds without a key), its version history, editing it, and making a new one. Saving over a
// production parameter (one under /prod) needs its name typed out. Values are never cached, and the
// audit log records only their size.
import { useEventListener } from '@vueuse/core'
import type { SsmParam, SsmParamValue, SsmParamVersion } from '#shared/aws'

const A = useAwsStore()
const ui = useUiStore()

const list = useAwsLoad((ctx, force: boolean) => api.aws.params(ctx, force))
// A plain copy: IPC can't send a reactive object.
const val = useAwsLoad((ctx, meta: SsmParam, version?: number) => api.aws.paramValue(ctx, { ...meta }, version))
const hist = useAwsLoad((ctx, name: string) => api.aws.paramHistory(ctx, name))

type Mode = 'list' | 'value' | 'history' | 'edit' | 'new'
const mode = ref<Mode>('list')
const meta = ref<SsmParam | null>(null)
const p = computed<SsmParamValue | null>(() => val.data.value)
const shownVersion = ref<number | null>(null)

const t = useAwsTable<SsmParam>({
  rows: () => list.data.value || [],
  columns: () => [
    { key: 'name', label: 'Name', value: x => x.name, flex: true, mono: true },
    { key: 'type', label: 'Type', value: x => x.type, color: x => (x.type === 'SecureString' ? '#f0883e' : x.type === 'StringList' ? 'var(--blue)' : undefined) },
    { key: 'modified', label: 'Modified', value: x => x.modifiedAt, text: x => awsTime(x.modifiedAt, false), sort: 'time' },
    { key: 'ver', label: 'Ver', value: x => x.version, sort: 'num', align: 'right' },
  ],
  filter: (x, q) => matches(q, x.name),
  active: () => mode.value === 'list',
  open: x => openValue(x),
  openHint: 'value',
  keys: x => ({
    awsRefresh: { run: () => list.load(true) },
    awsParamNew: { run: startNew, hint: 'new' },
    ...(x ? {
      awsParamEdit: { run: () => openValue(x, true), hint: 'edit' },
      awsBookmark: { run: () => A.toggleBookmark('Parameter Store', x.name, x.name) },
      awsCopy: { run: () => copyText(x.name) },
    } : {}),
  }),
})

async function openValue(x: SsmParam, edit = false, version?: number) {
  meta.value = x
  shownVersion.value = version ?? null
  revealed.value = false
  cursor.value = 0
  mode.value = 'value'
  const r = await val.load(x, version)
  if (edit && r.ok) startEdit()
}

// ---------- The value ----------

const revealed = ref(false)
const cursor = ref(0)
let idle: ReturnType<typeof setTimeout> | null = null
const secure = computed(() => p.value?.type === 'SecureString')
const valueLines = computed(() => {
  const v = p.value?.value || ''
  return p.value?.type === 'StringList' ? v.split(',') : v.split('\n')
})
const mask = (s: string) => s.replace(/\S/g, '•')

/** Shows a secure value, masked again after 30 seconds without a key. */
function reveal() {
  revealed.value = !revealed.value
  armMask()
}
function armMask() {
  if (idle) clearTimeout(idle)
  if (revealed.value) idle = setTimeout(() => { revealed.value = false }, 30_000)
}
useEventListener(window, 'keydown', () => { if (revealed.value) armMask() })
onBeforeUnmount(() => { if (idle) clearTimeout(idle) })
onDeactivated(() => { revealed.value = false })

function moveCursor(d: number, abs = false) {
  const n = valueLines.value.length
  cursor.value = Math.min(n - 1, Math.max(0, abs ? d : cursor.value + d))
  nextTick(() => document.querySelector('[data-aws-line="true"]')?.scrollIntoView({ block: 'nearest' }))
}

// ---------- History ----------

function openHistory() {
  if (!meta.value) return
  mode.value = 'history'
  hist.load(meta.value.name)
}

const ht = useAwsTable<SsmParamVersion>({
  rows: () => hist.data.value || [],
  columns: () => [
    { key: 'ver', label: 'Version', value: v => v.version, sort: 'num' },
    { key: 'modified', label: 'Modified', value: v => v.modifiedAt, text: v => awsTime(v.modifiedAt), sort: 'time' },
    { key: 'by', label: 'Modified by', value: v => v.modifiedBy, flex: true },
  ],
  filter: (v, q) => matches(q, v.version, v.modifiedBy),
  active: () => mode.value === 'history',
  open: v => openValue(meta.value!, false, v.version),
  openHint: 'show',
  back: () => { mode.value = 'value' },
  keys: () => ({ awsRefresh: { run: () => meta.value && hist.load(meta.value.name) } }),
})

// ---------- Editing and new parameters ----------

const draft = ref({ name: '', type: 'String', keyId: 'alias/aws/ssm', value: '', description: '' })
const saving = ref(false)
const valueBox = ref<HTMLTextAreaElement | null>(null)
const nameBox = ref<HTMLInputElement | null>(null)
const findText = ref('')
const findOpen = ref(false)
const findBox = ref<HTMLInputElement | null>(null)

function startEdit() {
  const v = p.value
  if (!v) return
  draft.value = { name: v.name, type: v.type, keyId: v.keyId, value: v.value, description: v.description }
  mode.value = 'edit'
  nextTick(() => valueBox.value?.focus())
}

function startNew() {
  draft.value = { name: '/', type: 'String', keyId: 'alias/aws/ssm', value: '', description: '' }
  mode.value = 'new'
  nextTick(() => nameBox.value?.focus())
}

function save() {
  const d = draft.value
  const isNew = mode.value === 'new'
  if (isNew && !d.name.startsWith('/')) return ui.toast({ title: 'A name starts with /', error: true })
  if (!d.value) return ui.toast({ title: 'The value is empty', body: 'Parameter Store needs a value.', error: true })
  const run = async () => {
    saving.value = true
    const r = await api.aws.paramPut(A.c(), { name: d.name, value: d.value, type: d.type, overwrite: !isNew, description: d.description, keyId: d.type === 'SecureString' ? d.keyId : undefined })
    saving.value = false
    if (!A.done(r, `Saved ${d.name}`, r.result || '')) return
    list.load(true)
    if (r.dryRun) {
      mode.value = 'list'
      return
    }
    const fresh = { name: d.name, type: d.type, version: 0, modifiedAt: Date.now(), modifiedBy: '', description: d.description, keyId: d.keyId }
    openValue(meta.value && !isNew ? meta.value : fresh)
  }
  // Saving over production asks for the name typed out; a new parameter can't overwrite anything.
  if (!isNew && /\/prod/i.test(d.name)) {
    A.confirm({ title: 'Confirm production write', body: `${d.name} will get a new version.`, typed: d.name, ok: 'Save', run })
  } else run()
}

/** Ctrl+S saves, Ctrl+F finds in the value, Esc goes back. */
function onEditKey(e: KeyboardEvent) {
  if (e.ctrlKey && e.code === 'KeyS') {
    e.preventDefault()
    save()
  } else if (e.ctrlKey && e.code === 'KeyF') {
    e.preventDefault()
    findOpen.value = true
    nextTick(() => findBox.value?.focus())
  } else if (e.ctrlKey && (e.code === 'KeyN' || e.code === 'KeyP')) {
    e.preventDefault()
    findNext(e.code === 'KeyN' ? 1 : -1)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (findOpen.value) {
      findOpen.value = false
      valueBox.value?.focus()
      return
    }
    mode.value = mode.value === 'new' ? 'list' : 'value'
    focusAwsWindow()
  }
}

const findCount = computed(() => {
  const q = findText.value.toLowerCase()
  if (!q) return 0
  return draft.value.value.toLowerCase().split(q).length - 1
})

/** Selects the next (or previous) match in the value box. */
function findNext(d: number) {
  const box = valueBox.value
  const q = findText.value.toLowerCase()
  if (!box || !q) return
  const hay = draft.value.value.toLowerCase()
  const from = d > 0 ? box.selectionEnd : Math.max(0, box.selectionStart - 1)
  let i = d > 0 ? hay.indexOf(q, from) : hay.lastIndexOf(q, from - 1)
  if (i < 0) i = d > 0 ? hay.indexOf(q) : hay.lastIndexOf(q)
  if (i < 0) return
  box.focus()
  box.setSelectionRange(i, i + q.length)
  // Bring the match into view.
  const line = draft.value.value.slice(0, i).split('\n').length
  box.scrollTop = Math.max(0, (line - 4) * 19)
}

function onFindKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault()
    findNext(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    findNext(-1)
  } else onEditKey(e)
}

// ---------- Keys for the value screen ----------

useAwsKeys(() => {
  if (mode.value === 'value' && p.value) {
    return {
      keys: {
        awsBack: { run: () => { mode.value = 'list'; revealed.value = false } },
        awsDown: { run: () => moveCursor(1) },
        awsUp: { run: () => moveCursor(-1) },
        awsPageDown: { run: () => moveCursor(15) },
        awsPageUp: { run: () => moveCursor(-15) },
        awsTop: { run: () => moveCursor(0, true) },
        awsBottom: { run: () => moveCursor(valueLines.value.length - 1, true) },
        ...(secure.value ? { awsParamReveal: { run: reveal, hint: revealed.value ? 'mask' : 'reveal' } } : {}),
        awsCopy: { run: () => copyText(p.value!.value, 'Value copied'), hint: 'copy' },
        awsParamCopyLine: { run: () => copyText(valueLines.value[cursor.value] || '', 'Line copied') },
        awsParamHistory: { run: openHistory, hint: 'history' },
        awsParamEdit: { run: startEdit, hint: 'edit' },
        awsRefresh: { run: () => meta.value && openValue(meta.value, false, shownVersion.value ?? undefined) },
      },
    }
  }
  if (mode.value === 'edit' || mode.value === 'new') return { keys: { awsBack: { run: () => { mode.value = mode.value === 'new' ? 'list' : 'value' } } } }
  return { keys: {} }
})

useAwsJump('Parameter Store', (q) => {
  mode.value = 'list'
  t.query.value = q
})

onMounted(() => list.load(false))
</script>

<template>
  <AwsGrid
    v-if="mode === 'list'"
    :t="t"
    title="Parameter Store"
    :busy="list.busy.value"
    :error="list.error.value"
    :at="list.at.value"
    :waiting="!list.data.value"
    :row-key="x => x.name"
    empty="No parameters in this region."
    @open="x => openValue(x)"
    @refresh="list.load(true)"
  >
    <template #actions>
      <UButton size="xs" color="neutral" variant="subtle" label="New…" @click="startNew" />
    </template>
  </AwsGrid>

  <AwsGrid
    v-else-if="mode === 'history' && meta"
    :t="ht"
    :title="`History · ${meta.name}`"
    :busy="hist.busy.value"
    :error="hist.error.value"
    :at="hist.at.value"
    :waiting="!hist.data.value"
    :row-key="v => String(v.version)"
    @open="v => openValue(meta!, false, v.version)"
    @refresh="hist.load(meta.name)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'value'" />
    </template>
  </AwsGrid>

  <div v-else-if="mode === 'value' && meta" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'list'" />
      <span class="mono ellipsis text-[13px] font-semibold">{{ meta.name }}</span>
      <span v-if="shownVersion" class="text-[11.5px] text-(--amb)">version {{ shownVersion }}</span>
      <div class="flex-1" />
      <UButton v-if="secure" size="xs" color="neutral" variant="subtle" :icon="revealed ? 'i-hugeicons-view-off-slash' : 'i-hugeicons-view'" :label="revealed ? 'Mask' : 'Reveal'" @click="reveal" />
      <UButton size="xs" color="neutral" variant="subtle" label="History" @click="openHistory" />
      <UButton size="xs" color="primary" variant="subtle" label="Edit" :disabled="!p" @click="startEdit" />
    </div>
    <div v-if="val.error.value" class="px-4 py-2 text-[12px] text-(--red)">{{ val.error.value }}</div>
    <div v-if="p" class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Type', v: p.type, color: p.type === 'SecureString' ? '#f0883e' : undefined },
          { k: 'Version', v: p.version },
          { k: 'Last modified', v: awsTime(p.modifiedAt) },
          { k: 'Modified by', v: p.modifiedBy },
          { k: 'KMS key', v: p.keyId, mono: true },
          { k: 'Description', v: p.description },
        ]"
      />
      <div class="mono mt-4 overflow-hidden rounded-md border border-(--ln) bg-(--term) py-1.5 text-[12px] leading-[1.6]">
        <div
          v-for="(l, i) in valueLines"
          :key="i"
          class="select-text whitespace-pre-wrap px-3 text-(--ttx) [overflow-wrap:anywhere]"
          :class="i === cursor && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
          :data-aws-line="i === cursor"
          @click="cursor = i"
        >{{ secure && !revealed ? mask(l) : l || ' ' }}</div>
      </div>
      <div v-if="secure" class="mt-2 text-[11.5px] text-(--fa)">{{ revealed ? 'Masks itself again after 30 seconds without a key.' : 'Masked. Y copies the real value even so.' }}</div>
    </div>
    <div v-else class="grid flex-1 place-items-center text-[12px] text-(--fa)">{{ val.busy.value ? 'Reading the value…' : '' }}</div>
  </div>

  <div v-else-if="mode === 'edit' || mode === 'new'" class="flex min-h-0 min-w-0 flex-1 flex-col" @keydown="onEditKey">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = mode === 'new' ? 'list' : 'value'" />
      <span class="text-[13px] font-semibold">{{ mode === 'new' ? 'New parameter' : 'Edit' }}</span>
      <span v-if="mode === 'edit'" class="mono ellipsis text-[12.5px] text-(--mu)">{{ draft.name }}</span>
      <span v-if="mode === 'edit' && /\/prod/i.test(draft.name)" class="rounded-sm bg-(--red)/15 px-1.5 text-[11px] text-(--red)">production</span>
      <div class="flex-1" />
      <span class="text-[11px] text-(--fa)">Ctrl+S saves · Ctrl+F finds · Esc goes back</span>
      <UButton size="xs" color="primary" label="Save" :loading="saving" @click="save" />
    </div>
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-5 py-4">
      <template v-if="mode === 'new'">
        <label class="flex items-center gap-3 text-[12.5px]">
          <span class="w-[90px] text-(--mu)">Name</span>
          <input ref="nameBox" v-model="draft.name" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
        </label>
        <div class="flex items-center gap-3 text-[12.5px]">
          <span class="w-[90px] text-(--mu)">Type</span>
          <Seg v-model="draft.type" size="sm" :items="['String', 'StringList', 'SecureString'].map(x => ({ label: x, value: x }))" />
        </div>
        <label v-if="draft.type === 'SecureString'" class="flex items-center gap-3 text-[12.5px]">
          <span class="w-[90px] text-(--mu)">KMS key</span>
          <input v-model="draft.keyId" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
        </label>
      </template>
      <div v-else class="text-[12px] text-(--mu)">Type {{ draft.type }} (it can't change for this name) · version {{ p?.version }}</div>
      <div v-if="findOpen" class="flex items-center gap-2">
        <span class="text-[12px] text-(--mu)">Find</span>
        <input ref="findBox" v-model="findText" class="mono h-7 flex-1 rounded-md border border-(--ln) bg-(--inp) px-2 text-[12px] text-(--tx) outline-none" @keydown="onFindKey">
        <span class="text-[11px] text-(--fa)">{{ findCount }} found · Enter next · ↑ previous</span>
      </div>
      <textarea
        ref="valueBox"
        v-model="draft.value"
        spellcheck="false"
        class="mono min-h-[220px] flex-1 resize-none rounded-md border border-(--ln) bg-(--inp) px-3 py-2 text-[12.5px] leading-[19px] text-(--tx) outline-none focus:border-(--lnk)"
        placeholder="The value"
      />
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[90px] text-(--mu)">Description</span>
        <input v-model="draft.description" class="h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
      </label>
    </div>
  </div>
</template>
