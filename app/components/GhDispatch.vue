<script setup lang="ts">
// Runs a workflow by hand: pick one of the repo's workflow_dispatch workflows, then the branch and
// its inputs. Keyboard first: j/k and Enter to pick, Tab through the form, Ctrl Enter to run.
import { useEventListener } from '@vueuse/core'
import type { GhDispatchable } from '#shared/types'

const props = defineProps<{ repo: string }>()

const G = useGithubStore()
const ui = useUiStore()

const workflows = ref<GhDispatchable[] | null>(null)
const error = ref('')
const branches = ref<string[]>([])
const chosen = ref<GhDispatchable | null>(null)
const ref_ = ref('')
const values = ref<Record<string, string>>({})
const running = ref(false)
const form = ref<HTMLElement | null>(null)

async function load() {
  const [w, b] = await Promise.all([api.gh.dispatchables(props.repo), api.gh.branches(props.repo)])
  error.value = w.ok ? '' : w.error || 'Could not read the workflows.'
  workflows.value = w.workflows
  branches.value = b
  ref_.value = b[0] || ''
}

function close() {
  G.dispatch = null
  focusGhWindow()
}

function choose(w: GhDispatchable) {
  chosen.value = w
  values.value = Object.fromEntries(w.inputs.map(i => [i.name, i.default || (i.type === 'boolean' ? 'false' : i.options[0] || '')]))
  nextTick(() => (form.value?.querySelector('select, input') as HTMLElement | null)?.focus())
}

function backToList() {
  chosen.value = null
  focusGhWindow()
}

const missing = computed(() => chosen.value?.inputs.filter(i => i.required && !String(values.value[i.name] ?? '').trim()).map(i => i.name) || [])

async function run() {
  const w = chosen.value
  if (!w || running.value) return
  if (!ref_.value) return ui.toast({ title: 'Pick a branch to run it on', error: true })
  if (missing.value.length) return ui.toast({ title: 'Fill in the required inputs', body: missing.value.join(', '), error: true })
  running.value = true
  const r = await api.gh.runWorkflow(props.repo, w.id, ref_.value, values.value)
  running.value = false
  if (!r.ok) return ui.toast({ title: `Could not run ${w.name}`, body: r.error, error: true })
  ui.toast({ title: `Started ${w.name} on ${ref_.value}`, body: `${props.repo} · it shows in Workflows in a few seconds` })
  close()
  setTimeout(() => useGhWorldStore().refreshRepos([props.repo]), 4000)
}

function onFormKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    e.stopPropagation()
    run()
  }
}

// Ctrl Enter runs it even when no field has focus.
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (chosen.value && !ui.confirm && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !(e.target as HTMLElement).closest('[data-gh-dispatch-form]')) {
    e.preventDefault()
    run()
  }
})

const sel = ref(0)
function move(d: number) {
  const n = workflows.value?.length || 0
  if (!n) return
  sel.value = Math.min(n - 1, Math.max(0, sel.value + d))
  nextTick(() => document.querySelector('[data-gh-sel="true"]')?.scrollIntoView({ block: 'nearest' }))
}

// A dialog: the screen underneath gets no keys while it's open.
useGhKeys(() => ({
  modal: true,
  // Running takes Ctrl Enter (or the button), never a plain Enter: this can be a production deploy.
  keys: chosen.value
    ? { ghBack: { run: backToList, hint: 'back' } }
    : {
        ghDown: { run: () => move(1), hint: 'move' },
        ghUp: { run: () => move(-1) },
        ghOpen: { run: () => { const w = workflows.value?.[sel.value]; if (w) choose(w) }, hint: 'choose' },
        ghBack: { run: close, hint: 'close' },
      },
}))

onMounted(load)
</script>

<template>
  <div class="absolute inset-0 z-20 grid place-items-center bg-black/40 p-6" @click.self="close">
    <div class="flex max-h-full w-[min(560px,100%)] flex-col overflow-hidden rounded-xl border border-(--bb) bg-(--modal) shadow-(--shadow)">
      <div class="flex h-11 flex-none items-center gap-2 border-b border-(--ln) px-4">
        <UIcon name="i-hugeicons-play" class="size-4 text-(--grn)" />
        <span class="text-[13px] font-semibold">Run a workflow</span>
        <span class="mono ellipsis text-[11.5px] text-(--mu)">{{ repo }}</span>
        <div class="flex-1" />
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Close (Esc)" @click="close" />
      </div>

      <!-- Which workflow -->
      <div v-if="!chosen" class="min-h-0 flex-1 overflow-auto py-1">
        <div v-if="error" class="px-4 py-3 text-[12px] text-(--red)">{{ error }}</div>
        <div v-else-if="!workflows" class="px-4 py-6 text-center text-[12px] text-(--fa)">Reading the repo's workflows…</div>
        <div v-else-if="!workflows.length" class="px-4 py-6 text-center text-[12px] text-(--fa)">No workflow here can be run by hand. A workflow needs a <span class="mono">workflow_dispatch</span> trigger for that.</div>
        <button
          v-for="(w, i) in workflows || []"
          :key="w.id"
          class="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left hover:bg-(--hov)"
          :class="i === sel && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
          :data-gh-sel="i === sel"
          @click="choose(w)"
        >
          <UIcon name="i-hugeicons-workflow-square-10" class="size-4 flex-none text-(--mu)" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="ellipsis text-[13px] text-(--tx)">{{ w.name }}</span>
            <span class="mono ellipsis text-[11px] text-(--fa)">{{ w.path }}</span>
          </div>
          <span class="flex-none text-[11px] text-(--mu)">{{ w.inputs.length ? `${w.inputs.length} input${w.inputs.length === 1 ? '' : 's'}` : 'no inputs' }}</span>
        </button>
      </div>

      <!-- The branch and the inputs -->
      <div v-else ref="form" data-gh-dispatch-form class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3" @keydown="onFormKey">
        <div class="flex items-center gap-2">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back to the workflows" @click="backToList" />
          <span class="text-[13px] font-semibold">{{ chosen.name }}</span>
        </div>
        <label class="flex flex-col gap-1">
          <span class="text-[12px] font-medium">Branch</span>
          <select v-model="ref_" class="h-[30px] rounded-md border border-(--ln) bg-(--inp) px-2 text-[12.5px] text-(--tx)">
            <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label v-for="inp in chosen.inputs" :key="inp.name" class="flex flex-col gap-1">
          <span class="text-[12px] font-medium">
            <span class="mono">{{ inp.name }}</span><span v-if="inp.required" class="text-(--red)"> *</span>
            <span v-if="inp.description" class="font-normal text-(--mu)"> · {{ inp.description }}</span>
          </span>
          <span v-if="inp.type === 'boolean'" class="flex items-center gap-2 text-[12.5px] text-(--tx2)">
            <input
              type="checkbox"
              class="accent-(--grn)"
              :checked="values[inp.name] === 'true'"
              @change="values[inp.name] = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
            >{{ values[inp.name] === 'true' ? 'true' : 'false' }}
          </span>
          <select v-else-if="inp.type === 'choice' || inp.type === 'environment'" v-model="values[inp.name]" class="h-[30px] rounded-md border border-(--ln) bg-(--inp) px-2 text-[12.5px] text-(--tx)">
            <option v-if="!inp.required" value="">(none)</option>
            <option v-for="o in inp.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <input
            v-else
            v-model="values[inp.name]"
            :type="inp.type === 'number' ? 'number' : 'text'"
            :placeholder="inp.default || ''"
            class="h-[30px] rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) placeholder:text-(--fa)"
          >
        </label>
        <div class="flex items-center justify-end gap-2 pt-1">
          <span class="mr-auto text-[11px] text-(--fa)">Ctrl Enter to run · Esc to leave a field, then to go back</span>
          <UButton size="sm" color="neutral" variant="ghost" label="Back" @click="backToList" />
          <UButton size="sm" color="success" icon="i-hugeicons-play" :loading="running" :label="`Run on ${ref_ || '…'}`" @click="run" />
        </div>
      </div>
    </div>
  </div>
</template>
