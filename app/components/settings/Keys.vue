<script setup lang="ts">
import { ACTIONS, RESERVED, comboOf, type ActionDef } from '#shared/actions'

type Msg =
  | { kind: 'err'; id: string; t: string }
  | { kind: 'conflict'; id: string; idx: number | null; combo: string; other: string; t: string }

const prefs = usePrefsStore()
const q = ref('')
/** The binding being recorded; idx null means a new extra binding. */
const rec = ref<{ id: string; idx: number | null } | null>(null)
const msg = ref<Msg | null>(null)

const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  const out: { name: string; rows: ActionDef[] }[] = []
  for (const a of ACTIONS) {
    const ks = prefs.keysFor(a.id)
    if (s && !(a.label.toLowerCase().includes(s) || ks.some(k => k.toLowerCase().replace(/\+/g, ' ').includes(s)))) continue
    let g = out.find(x => x.name === a.g)
    if (!g) out.push(g = { name: a.g, rows: [] })
    g.rows.push(a)
  }
  return out
})

const hasCustom = computed(() => Object.keys(prefs.keys).length > 0)

const FIXED = [
  { caps: ['Alt', '1-9'], label: 'Switch to project 1-9' },
  { caps: ['Esc'], label: 'Close the top overlay, or interrupt Claude' },
  { caps: ['1', '2', '3'], label: 'Answer a permission prompt' },
]

function startRec(id: string, idx: number | null) {
  rec.value = { id, idx }
  msg.value = null
}

function assign(id: string, idx: number | null, combo: string, stealFrom?: string) {
  prefs.assignKey(id, idx, combo, stealFrom)
  rec.value = null
  msg.value = null
}

function recordKey(combo: string) {
  const r = rec.value
  if (!r) return
  const nice = combo.replace(/\+/g, ' ')
  if (combo === 'Esc') { rec.value = null; msg.value = null; return }
  if (RESERVED[combo]) { msg.value = { kind: 'err', id: r.id, t: RESERVED[combo] + ' Pick another shortcut.' }; return }
  const last = combo.split('+').pop() || ''
  if (!/Ctrl|Alt/.test(combo) && !/^F\d+$/.test(last)) { msg.value = { kind: 'err', id: r.id, t: 'Add Ctrl or Alt to ' + nice + ' so typing still reaches the terminal.' }; return }
  if (/^Alt\+[1-9]$/.test(combo)) { msg.value = { kind: 'err', id: r.id, t: 'Alt 1-9 already switches projects.' }; return }
  const other = ACTIONS.find(a => a.id !== r.id && prefs.keysFor(a.id).includes(combo))
  if (other) {
    rec.value = null
    msg.value = { kind: 'conflict', id: r.id, idx: r.idx, combo, other: other.id, t: nice + ' is already used by "' + other.label + '".' }
    return
  }
  assign(r.id, r.idx, combo)
}

function replace() {
  const m = msg.value
  if (m && m.kind === 'conflict') assign(m.id, m.idx, m.combo, m.other)
}

// While recording, swallow every key before anything else (terminal, modal, shortcuts) sees it.
function onKey(e: KeyboardEvent) {
  if (!rec.value) return
  e.preventDefault()
  e.stopImmediatePropagation()
  const cb = comboOf(e)
  if (cb) recordKey(cb)
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

const CAP = 'mono h-[18px] min-w-0 px-[5px] text-[10.5px] font-normal normal-case rounded-sm border border-(--bb) border-b-2 bg-(--chrome) text-(--tx) ring-0 box-border'
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="mb-1 text-[15px] font-semibold">Keyboard shortcuts</div>

    <div class="flex items-center gap-2">
      <UInput
        v-model="q"
        autofocus
        placeholder="Search by action or key"
        variant="none"
        class="min-w-0 flex-1"
        :ui="{
          root: 'w-full',
          base: 'h-[32px] ps-[30px] pe-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx)',
          leading: 'ps-[10px]',
        }"
      >
        <template #leading>
          <UIcon name="i-hugeicons-search-01" class="size-3.5 flex-none text-(--fa)" />
        </template>
      </UInput>
      <UButton v-if="hasCustom" color="neutral" variant="outline" class="h-8 px-3 text-[12px]" @click="prefs.resetAllKeys(); rec = null; msg = null">
        Reset all
      </UButton>
    </div>

    <div class="text-[11.5px] leading-[1.5] text-(--mu)">Click a shortcut to change it, or + to add another. Shortcuts need Ctrl or Alt so plain typing still reaches Claude.</div>

    <div v-for="g in groups" :key="g.name" class="flex flex-col">
      <div class="label-caps px-2 pt-2 pb-1">{{ g.name }}</div>
      <div
        v-for="a in g.rows"
        :key="a.id"
        class="flex flex-col gap-1.5 rounded-lg px-2 py-[5px] hover:bg-(--hov)"
        :class="(rec?.id === a.id || msg?.id === a.id) && 'bg-(--sel)'"
      >
        <div class="flex min-h-[26px] items-center gap-2.5">
          <span class="min-w-0 flex-1 text-[12.5px] text-(--tx2)">{{ a.label }}</span>
          <div class="flex flex-wrap items-center justify-end gap-1.5">
            <div
              v-for="(k, idx) in prefs.keysFor(a.id)"
              :key="k"
              role="button"
              tabindex="0"
              title="Click to change"
              class="box-border flex h-[26px] cursor-pointer items-center gap-[3px] rounded-md border pr-[3px] pl-[4px]"
              :class="rec?.id === a.id && rec.idx === idx ? 'border-(--ambf) bg-(--ambs)' : 'border-(--ln) bg-transparent'"
              @click="startRec(a.id, idx)"
              @keydown.enter.prevent="startRec(a.id, idx)"
            >
              <span v-if="rec?.id === a.id && rec.idx === idx" class="whitespace-nowrap px-1 text-[11px] text-(--amb)">Press keys… Esc cancels</span>
              <template v-else>
                <UKbd v-for="(cap, ci) in k.split('+')" :key="ci" :class="CAP">{{ cap }}</UKbd>
                <span
                  role="button"
                  title="Remove"
                  class="grid size-4 place-items-center rounded-sm text-[9px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
                  @click.stop="prefs.removeKey(a.id, idx)"
                ><UIcon name="i-hugeicons-cancel-01" class="size-2.5" /></span>
              </template>
            </div>
            <div
              v-if="rec?.id === a.id && rec.idx == null"
              class="box-border flex h-[26px] items-center whitespace-nowrap rounded-md border border-(--ambf) bg-(--ambs) px-2 text-[11px] text-(--amb)"
            >
              Press keys… Esc cancels
            </div>
            <span v-if="!prefs.keysFor(a.id).length && !(rec?.id === a.id && rec.idx == null)" class="text-[11.5px] text-(--fa)">Not set</span>
            <UButton
              color="neutral"
              variant="ghost"
              title="Add a shortcut"
              class="grid size-[22px] place-items-center rounded-sm p-0 text-[14px] text-(--mu) hover:bg-(--segon) hover:text-(--tx)"
              @click="startRec(a.id, null)"
            >
              +
            </UButton>
            <button v-if="prefs.keys[a.id]" type="button" title="Reset to default" class="cursor-pointer text-[11px] text-(--lnk)" @click="prefs.resetKey(a.id)">Reset</button>
          </div>
        </div>
        <div
          v-if="msg?.id === a.id"
          class="flex items-center gap-2.5 pb-[2px] text-[11.5px]"
          :class="msg.kind === 'err' ? 'text-(--red)' : 'text-(--amb)'"
        >
          <span class="flex-1 leading-[1.4]">{{ msg.t }}</span>
          <UButton v-if="msg.kind === 'conflict'" color="primary" class="h-[22px] rounded-sm px-2 text-[11.5px] font-semibold" @click="replace">Use it here</UButton>
          <button type="button" class="cursor-pointer text-(--mu)" @click="msg = null">Dismiss</button>
        </div>
      </div>
    </div>

    <div v-if="!groups.length" class="px-2 py-2.5 text-[12px] text-(--fa)">No shortcuts match.</div>

    <div class="flex flex-col">
      <div class="label-caps px-2 pt-2 pb-1">Built in · can’t be changed</div>
      <div v-for="fx in FIXED" :key="fx.label" class="flex min-h-[30px] items-center gap-2.5 px-2 py-[2px]">
        <span class="flex-1 text-[12.5px] text-(--tx3)">{{ fx.label }}</span>
        <div class="flex gap-[3px] opacity-70">
          <UKbd v-for="cap in fx.caps" :key="cap" :class="CAP">{{ cap }}</UKbd>
        </div>
      </div>
    </div>
  </div>
</template>
