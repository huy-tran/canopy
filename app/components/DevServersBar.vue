<script setup lang="ts">
import type { Repo, Service } from '#shared/types'

const ui = useUiStore()
const P = useProjectsStore()
const V = useServicesStore()

const SVC: Record<string, string> = { running: 'var(--grn)', starting: 'var(--ambf)', stopped: 'var(--idle)' }

const bar = ref<HTMLElement | null>(null)
const cmdInput = ref<any>(null)

const cur = computed(() => P.current)
const list = computed(() => V.ofProject(cur.value))
const tabId = computed(() => (list.value.some(v => v.id === ui.svcTab) ? ui.svcTab : list.value[0]?.id))
const anyRun = computed(() => list.value.some(v => V.status(v.id) !== 'stopped'))

function openUrl(port: string) {
  api.sys.openExternal('http://localhost:' + port)
}

function toggle(v: Service & { repo: Repo }) {
  if (V.status(v.id) === 'stopped') V.start(v, v.repo)
  else V.stop(v.id)
}

function allAction() {
  if (anyRun.value) V.stopProject(cur.value)
  else V.startProject(cur.value)
}

// ---------- Add popover ----------

const add = ref({ repoId: '', cmd: '', port: '', err: '' })

const open = computed({
  get: () => ui.svcAdd && !!cur.value?.repos.length,
  set: (v: boolean) => {
    if (v) ui.newMenu = false
    ui.svcAdd = v
  },
})

// Fresh form each time the popover opens, defaulting to the focused session's repo.
watch(() => ui.svcAdd, (v) => {
  const p = cur.value
  if (!v || !p || !p.repos.length) return
  const fs = ui.focused
  add.value = { repoId: fs && fs.pid === p.id ? fs.repoId : p.repos[0]!.id, cmd: '', port: '', err: '' }
}, { immediate: true })

const addRepo = computed(() => {
  const p = cur.value
  return p ? (p.repos.find(r => r.id === add.value.repoId) || p.repos[0] || null) : null
})
const repoItems = computed(() => (cur.value?.repos || []).map(r => ({ label: r.label, value: r.id })))

function kind(r: Repo) {
  const s = (r.stack || '') + ' ' + r.label
  return /laravel|php/i.test(s) ? 'laravel' : /nuxt|vue/i.test(s) ? 'nuxt' : /astro/i.test(s) ? 'astro' : 'next'
}

function presetsOf(r: Repo): [string, string, string][] {
  return kind(r) === 'laravel'
    ? [['php artisan serve', '8000', 'HTTP server'], ['php artisan queue:work', '', 'Queue worker'], ['php artisan horizon', '', 'Queues with dashboard'], ['php artisan reverb:start', '8080', 'WebSockets'], ['php artisan schedule:work', '', 'Scheduler'], ['php artisan pail', '', 'Log tail'], ['npm run dev', '5173', 'Vite']]
    : [['npm run dev', '3000', 'Dev server'], ['npm run storybook', '6006', 'Storybook'], ['npm run test -- --watch', '', 'Tests in watch mode']]
}

const presets = computed(() => {
  const r = addRepo.value
  if (!r) return []
  return presetsOf(r).map(([cmd, port, desc]) => ({ cmd, port, desc, added: (r.services || []).some(v => v.cmd === cmd) }))
})

function setAdd(patch: Partial<typeof add.value>) {
  add.value = { ...add.value, err: '', ...patch }
}

function addSvc(start: boolean) {
  const a = add.value, p = cur.value, r = addRepo.value
  const cmd = a.cmd.trim()
  if (!cmd) {
    setAdd({ err: 'Type a command or pick a suggestion.' })
    return
  }
  if (!p || !r) return
  if ((r.services || []).some(v => v.cmd === cmd)) {
    setAdd({ err: 'Already added to ' + r.label + '.' })
    return
  }
  const v: Service = { id: uid('v'), cmd, port: String(a.port || '').replace(/[^0-9]/g, '') }
  P.update(p.id, q => ({ ...q, repos: q.repos.map(rr => (rr.id === r.id ? { ...rr, services: [...(rr.services || []), v] } : rr)) }))
  ui.svcAdd = false
  ui.svcTab = v.id
  if (start) {
    V.start(v, r)
    ui.logsOpen = true
  }
}

function manage() {
  ui.svcAdd = false
  ui.openModal('edit')
}

function onAddKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addSvc(true)
  }
}

function focusCmd(e: Event) {
  e.preventDefault()
  cmdInput.value?.inputRef?.focus()
}

const addField = 'h-[30px] px-[9px] py-0 rounded-md bg-(--inp) ring ring-inset mono text-[12px] text-(--tx)'
</script>

<template>
  <div v-if="cur" ref="bar" class="relative z-[44] flex-none">
    <div class="flex h-[30px] items-center gap-1.5 overflow-hidden border-b border-(--ln2) bg-(--head) px-2.5">
      <span class="label-caps mr-0.5 whitespace-nowrap">Dev servers</span>
      <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <span v-if="!list.length" class="whitespace-nowrap text-[11.5px] text-(--fa)">None yet</span>
        <div
          v-for="v in list"
          :key="v.id"
          :title="v.cmd"
          class="box-border flex h-5 max-w-[280px] flex-none cursor-pointer items-center gap-1.5 rounded border border-(--ln) py-0 pr-[3px] pl-[7px] hover:border-(--bb)"
          :style="{ background: ui.logsOpen && v.id === tabId ? 'var(--sel)' : 'transparent' }"
          @click="ui.toggleLogs(v.id)"
        >
          <span class="size-1.5 flex-none rounded-full" :style="{ background: SVC[V.status(v.id)] }" />
          <span class="chip-repo">{{ v.repo.label }}</span>
          <span v-if="ui.wide" class="mono ellipsis text-[10.5px] text-(--tx3)">{{ v.cmd }}</span>
          <span
            v-if="V.status(v.id) === 'running' && v.port"
            title="Open in browser"
            class="mono flex-none whitespace-nowrap text-[10.5px] text-(--lnk) hover:underline"
            @click.stop="openUrl(v.port)"
          >:{{ v.port }}<UIcon name="i-hugeicons-arrow-up-right-01" class="size-3" /></span>
          <span
            :title="V.status(v.id) === 'stopped' ? 'Start' : 'Stop'"
            class="grid size-4 flex-none place-items-center rounded-sm text-[8px] text-(--tx3) hover:bg-(--hov) hover:text-(--tx)"
            @click.stop="toggle(v)"
          ><UIcon :name="V.status(v.id) === 'stopped' ? 'i-hugeicons-play' : 'i-hugeicons-stop'" class="size-3" /></span>
        </div>
      </div>

      <UPopover
        v-model:open="open"
        :reference="bar || undefined"
        :content="{ side: 'bottom', align: 'start', sideOffset: 4, alignOffset: 10, onOpenAutoFocus: focusCmd }"
        :ui="{ content: 'w-[420px] max-w-[calc(100vw-20px)] bg-(--modal) ring-0 border border-(--bb) rounded-lg shadow-(--shadow) p-3 flex flex-col gap-2.5 text-(--tx)' }"
      >
        <span
          title="Add a dev server"
          class="box-border flex h-5 flex-none cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-dashed border-(--bb) px-[7px] text-[11px] text-(--mu) hover:border-(--mu) hover:text-(--tx)"
        ><UIcon name="i-hugeicons-add-01" class="size-3" />Add</span>

        <template #content>
          <template v-if="addRepo">
            <div class="flex items-center gap-2.5">
              <span class="flex-1 text-[13px] font-semibold">Add a dev server</span>
              <Seg v-if="cur.repos.length > 1" :model-value="addRepo.id" :items="repoItems" mono @update:model-value="setAdd({ repoId: String($event) })" />
            </div>
            <div class="flex flex-col gap-px">
              <span class="label-caps px-2 pb-1">Suggested for {{ addRepo.label }}</span>
              <div
                v-for="ps in presets"
                :key="ps.cmd"
                class="flex h-[26px] items-center gap-2.5 rounded-md px-2 hover:bg-(--hov)"
                :style="{ background: add.cmd === ps.cmd ? 'var(--sel)' : undefined, cursor: ps.added ? 'default' : 'pointer', opacity: ps.added ? 0.5 : 1 }"
                @click="!ps.added && setAdd({ cmd: ps.cmd, port: ps.port })"
              >
                <span class="mono ellipsis flex-1 text-[11.5px] text-(--tx)">{{ ps.cmd }}</span>
                <span class="whitespace-nowrap text-[11px] text-(--fa)">{{ ps.desc }}</span>
                <span v-if="ps.added" class="text-[10.5px] text-(--grn)">Added</span>
              </div>
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_76px] gap-1.5">
              <UInput
                ref="cmdInput"
                :model-value="add.cmd"
                variant="none"
                placeholder="Any command, e.g. php artisan reverb:start"
                class="w-full"
                :ui="{ base: [addField, 'ring-(--bb)'] }"
                @update:model-value="setAdd({ cmd: String($event) })"
                @keydown="onAddKey"
              />
              <UTooltip text="Optional. Adds an Open link.">
                <UInput
                  :model-value="add.port"
                  variant="none"
                  placeholder="port"
                  class="w-full"
                  :ui="{ base: [addField, 'ring-(--ln)'] }"
                  @update:model-value="setAdd({ port: String($event) })"
                  @keydown="onAddKey"
                />
              </UTooltip>
            </div>
            <span v-if="add.err" class="text-[11.5px] text-(--red)">{{ add.err }}</span>
            <div class="flex items-center gap-2">
              <span class="cursor-pointer text-[11.5px] text-(--lnk) hover:underline" @click="manage">Manage in project settings</span>
              <div class="flex-1" />
              <UButton
                color="neutral"
                variant="outline"
                class="h-7 rounded-md bg-transparent px-3 py-0 text-[12px] font-normal text-(--tx2) ring-(--bb) hover:bg-(--hov)"
                @click="addSvc(false)"
              >
                Add
              </UButton>
              <UButton
                color="neutral"
                variant="solid"
                class="h-7 gap-2 rounded-md bg-(--inv) px-3 py-0 text-[12px] font-semibold text-(--invtx) hover:bg-(--inv) hover:opacity-90"
                @click="addSvc(true)"
              >
                Add and start<span class="mono text-[10px] font-medium opacity-60">Enter</span>
              </UButton>
            </div>
          </template>
        </template>
      </UPopover>

      <template v-if="list.length">
        <span class="flex-none cursor-pointer whitespace-nowrap text-[11px] text-(--tx3) hover:text-(--tx)" @click="allAction">{{ anyRun ? 'Stop all' : 'Start all' }}</span>
        <span
          title="Ctrl Shift S"
          class="box-border flex h-5 flex-none cursor-pointer items-center whitespace-nowrap rounded border border-(--bb) px-2 text-[11px] text-(--tx2) hover:text-(--tx)"
          :style="{ background: ui.logsOpen ? 'var(--segon)' : 'transparent' }"
          @click="ui.toggleLogs()"
        >Logs<UIcon :name="ui.logsOpen ? 'i-hugeicons-arrow-down-01' : 'i-hugeicons-arrow-up-01'" class="size-3" /></span>
      </template>
    </div>
  </div>
</template>
