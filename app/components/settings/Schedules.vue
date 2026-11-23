<script setup lang="ts">
import type { Schedule } from '#shared/types'
import { daysLabel, minutesOf } from '#shared/schedule'

const C = useSchedulesStore()
const P = useProjectsStore()

/** Monday first. */
const DAYS = [{ d: 1, l: 'Mon' }, { d: 2, l: 'Tue' }, { d: 3, l: 'Wed' }, { d: 4, l: 'Thu' }, { d: 5, l: 'Fri' }, { d: 6, l: 'Sat' }, { d: 0, l: 'Sun' }]
const FIELD = 'h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx) ring-0'
const SELECT = { base: `w-full ${FIELD}`, content: 'bg-(--modal) ring-0 border border-(--bb) rounded-lg', item: 'text-[12.5px]' }

/** The schedule being added or edited. */
const edit = ref<Schedule | null>(null)

const projects = computed(() => P.ordered.filter(p => p.repos.length).map(p => ({ label: p.name, value: p.id })))
const repos = computed(() => (P.byId(edit.value?.pid)?.repos || []).map(r => ({ label: r.label, value: r.id })))

function add() {
  const p = P.current?.repos.length ? P.current : P.ordered.find(x => x.repos.length)
  if (!p) return
  edit.value = { id: uid('c'), name: '', pid: p.id, repoId: p.repos[0]!.id, prompt: '', time: '09:00', days: [1, 2, 3, 4, 5], wt: true, enabled: true, lastRun: 0 }
}

function setProject(pid: string) {
  const e = edit.value
  if (e) edit.value = { ...e, pid, repoId: P.byId(pid)?.repos[0]?.id || '' }
}

function toggleDay(d: number) {
  const e = edit.value
  if (e) edit.value = { ...e, days: e.days.includes(d) ? e.days.filter(x => x !== d) : [...e.days, d] }
}

const problem = computed(() => {
  const e = edit.value
  if (!e) return ''
  if (!e.prompt.trim()) return 'Write the prompt to send.'
  if (minutesOf(e.time) == null) return 'Set a time.'
  if (!e.days.length) return 'Pick at least one day.'
  if (!e.repoId) return 'Pick a repo.'
  return ''
})

function save() {
  const e = edit.value
  if (!e || problem.value) return
  C.save({ ...e, name: e.name.trim() || e.prompt.trim().split('\n')[0]!.slice(0, 60), prompt: e.prompt.trim() })
  edit.value = null
}

const rows = computed(() => C.list.map((s) => {
  const p = P.byId(s.pid), r = p?.repos.find(x => x.id === s.repoId)
  return { s, where: p && r ? `${p.name} · ${r.label}` : 'Project or repo removed', when: `${daysLabel(s.days)} at ${s.time}`, gone: !p || !r }
}))
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-1 flex items-center gap-2">
      <span class="flex-1 text-[15px] font-semibold">Scheduled prompts</span>
      <UButton v-if="!edit" color="primary" size="xs" icon="i-hugeicons-add-01" class="h-[26px] px-2.5 text-[11.5px]" :disabled="!projects.length" label="New schedule" @click="add" />
    </div>
    <div class="mb-2 text-[12px] leading-[1.5] text-(--mu)">
      Starts a Claude session with a prompt at a set time, for chores such as dependency updates or triage. Runs while Canopy is open, including in the tray; a run missed while it was closed happens when you open it later the same day.
    </div>

    <div v-if="edit" class="mb-3 flex flex-col gap-2.5 rounded-lg border border-(--bb) bg-(--chrome) p-3">
      <UInput v-model="edit.name" variant="none" placeholder="Name (optional)" :ui="{ base: FIELD }" />
      <div class="grid grid-cols-2 gap-2">
        <USelect :model-value="edit.pid" :items="projects" :ui="SELECT" @update:model-value="(v: string) => setProject(v)" />
        <USelect v-model="edit.repoId" :items="repos" placeholder="Repo" :ui="SELECT" />
      </div>
      <UTextarea v-model="edit.prompt" :rows="4" autoresize :maxrows="12" variant="none" placeholder="The prompt Claude gets, e.g. Update the npm dependencies, run the tests and summarise what changed." :ui="{ base: 'w-full bg-(--inp) border border-(--ln) rounded-md px-[10px] py-2 text-[12.5px] leading-[1.5] text-(--tx)' }" />
      <div class="flex flex-wrap items-center gap-2">
        <input v-model="edit.time" type="time" class="mono h-[30px] rounded-md border border-(--ln) bg-(--inp) px-2 text-[12.5px] text-(--tx) outline-none">
        <div class="flex gap-1">
          <button
            v-for="d in DAYS"
            :key="d.d"
            type="button"
            class="h-[30px] w-[38px] cursor-pointer rounded-md border text-[11.5px]"
            :class="edit.days.includes(d.d) ? 'border-(--lnk) bg-(--sel) text-(--tx)' : 'border-(--ln) text-(--fa) hover:text-(--tx2)'"
            :aria-pressed="edit.days.includes(d.d)"
            @click="toggleDay(d.d)"
          >{{ d.l }}</button>
        </div>
      </div>
      <UCheckbox v-model="edit.wt" color="neutral" size="xs" label="Run in a fresh git worktree, away from the files other sessions are working on" :ui="{ root: 'items-center cursor-pointer', base: 'size-[13px] rounded-sm ring-(--bb)', wrapper: 'ms-2', label: 'text-[12px] font-normal text-(--tx3) cursor-pointer' }" />
      <div class="flex items-center gap-1.5">
        <span class="flex-1 text-[11.5px] text-(--amb)">{{ problem }}</span>
        <UButton color="neutral" variant="ghost" size="xs" class="h-[26px] px-2.5 text-[11.5px]" label="Cancel" @click="edit = null" />
        <UButton color="primary" size="xs" class="h-[26px] px-2.5 text-[11.5px]" label="Save schedule" :disabled="!!problem" @click="save" />
      </div>
    </div>

    <div v-for="r in rows" :key="r.s.id" class="flex items-center gap-3 border-b border-(--ln2) py-2.5">
      <div class="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span class="ellipsis text-[12.5px]" :class="r.s.enabled ? 'text-(--tx)' : 'text-(--fa)'">{{ r.s.name }}</span>
        <span class="ellipsis text-[11.5px]" :class="r.gone ? 'text-(--red)' : 'text-(--mu)'">{{ r.when }} · {{ r.where }}{{ r.s.wt ? ' · worktree' : '' }}</span>
      </div>
      <UTooltip text="Start it now">
        <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0 text-(--fa)" :disabled="r.gone" @click="C.run(r.s.id)"><UIcon name="i-hugeicons-play" class="size-3.5" /></UButton>
      </UTooltip>
      <UTooltip text="Edit">
        <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0 text-(--fa)" @click="edit = { ...r.s }"><UIcon name="i-hugeicons-edit-02" class="size-3.5" /></UButton>
      </UTooltip>
      <UTooltip text="Delete">
        <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0 text-(--fa)" @click="C.remove(r.s.id)"><UIcon name="i-hugeicons-delete-02" class="size-3.5" /></UButton>
      </UTooltip>
      <USwitch
        :model-value="r.s.enabled"
        :aria-label="`${r.s.name}: on or off`"
        :ui="{
          base: 'w-[30px] border-2 cursor-pointer data-[state=checked]:bg-(--grn) data-[state=unchecked]:bg-(--trk)',
          container: 'h-[18px]',
          thumb: 'size-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] data-[state=checked]:translate-x-[12px]',
        }"
        @update:model-value="(v: boolean) => C.toggle(r.s.id, v)"
      />
    </div>
    <div v-if="!rows.length && !edit" class="py-6 text-center text-[12px] text-(--fa)">
      {{ projects.length ? 'No scheduled prompts yet.' : 'Add a project with a repo first.' }}
    </div>
  </div>
</template>
