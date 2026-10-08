<script setup lang="ts">
// The workspace simulation: every project as a room and every Claude session and subagent as a
// person in it, drawn in 3D by WorkspaceScene.
import type { Session } from '#shared/types'
import { castFor, castOf } from '~/simulation/cast'
import { type Pick, type SimHover, type SimPerson, type SimRoom, WorkspaceScene } from '~/simulation/scene'

const P = useProjectsStore()
const S = useSessionsStore()
const ui = useUiStore()

const el = ref<HTMLElement | null>(null)
let scene: WorkspaceScene | null = null
const hover = ref<SimHover | null>(null)
const picked = ref<Pick | null>(null)

/** Claude sessions still running: the people at the desks. */
const active = computed(() => S.sessions.filter(s => s.kind === 'claude' && !s.exited && P.byId(s.pid)))

const people = computed<SimPerson[]>(() => {
  const ss = active.value
  const subs = ss.flatMap(s => (S.subagents[s.id] || []).map(a => ({ s, a })))
  const cast = castOf([...ss.map(s => s.id), ...subs.map(x => x.a.id)])
  return [
    ...ss.map(s => ({
      id: s.id, roomId: s.pid, parentId: null, name: cast.get(s.id)!.name, role: cast.get(s.id)!.role, status: s.status, title: s.title, line: S.chatter[s.id] || null,
    })),
    ...subs.map(({ s, a }) => ({
      id: a.id, roomId: s.pid, parentId: s.id, name: cast.get(a.id)!.name, role: cast.get(a.id)!.role, status: 'working' as const, title: a.desc || a.type, line: null,
    })),
  ]
})

const rooms = computed<SimRoom[]>(() => P.ordered.map((p) => {
  const ss = active.value.filter(s => s.pid === p.id)
  return {
    id: p.id,
    name: p.name,
    hue: p.hue,
    stats: {
      sessions: ss.length,
      working: ss.filter(s => s.status === 'working').length,
      waiting: ss.filter(s => s.status === 'waiting').length,
      subagents: ss.reduce((a, s) => a + (S.subagents[s.id]?.length || 0), 0),
      today: usd(ss.reduce((a, s) => a + S.cost(s), 0)),
    },
  }
}))

watch([rooms, people], () => scene?.sync(rooms.value, people.value))

onMounted(() => {
  scene = new WorkspaceScene({
    container: el.value!,
    onHover: (h) => { hover.value = h },
    onSelect: (p) => {
      picked.value = p
      // A person opens their session, or a subagent the session that started it, in a modal.
      if (p?.kind === 'person') {
        const who = people.value.find(x => x.id === p.id)
        if (who) talkTo.value = who.parentId || who.id
      }
    },
  })
  scene.sync(rooms.value, people.value)
})

onBeforeUnmount(() => {
  scene?.dispose()
  scene = null
})

// ---------- Hover cards and the picked person or room ----------

const hoverScreen = computed(() => (hover.value?.pick.kind === 'screen' ? hover.value.pick.id : null))
const hoverPerson = computed(() => (hover.value?.pick.kind === 'person' ? people.value.find(p => p.id === hover.value!.pick.id) || null : null))

/** Keeps a card beside the pointer and inside the view. */
function cardAt(w: number, h: number) {
  const box = el.value?.getBoundingClientRect()
  const x = hover.value?.x ?? 0, y = hover.value?.y ?? 0
  const left = box && x + 18 + w > box.width ? x - w - 18 : x + 18
  const top = box ? Math.min(Math.max(8, y - 40), box.height - h - 8) : y
  return { left: left + 'px', top: top + 'px' }
}

// ---------- The session modal ----------

/** The session open in the modal, with its live terminal. */
const talkTo = ref<string | null>(null)
const talkSession = computed(() => S.byId(talkTo.value))
const talkOpen = computed({
  get: () => !!talkSession.value,
  set: (v: boolean) => { if (!v) talkTo.value = null },
})
const talkProject = computed(() => (talkSession.value ? P.byId(talkSession.value.pid) : null))
const talkCast = computed(() => (talkTo.value ? castFor(talkTo.value) : undefined))
const talkHelpers = computed(() => (talkTo.value ? S.subagents[talkTo.value]?.length || 0 : 0))

const pickedPerson = computed(() => (picked.value?.kind === 'person' ? people.value.find(p => p.id === picked.value!.id) || null : null))
const pickedRoom = computed(() => {
  const pick = picked.value
  if (!pick) return null
  const pid = pick.kind === 'person' ? pickedPerson.value?.roomId : pick.id
  return P.byId(pid) || null
})

const pickedCount = computed(() => rooms.value.find(r => r.id === pickedRoom.value?.id)?.stats.sessions || 0)

/** The session a person is, or for a subagent, the session that started them. */
function sessionOf(p: SimPerson | null): Session | null {
  return p ? S.byId(p.parentId || p.id) : null
}

const totals = computed(() => {
  const ps = people.value
  const sessions = ps.filter(p => !p.parentId).length
  return { rooms: rooms.value.length, lit: rooms.value.filter(r => r.stats.sessions).length, sessions, subagents: ps.length - sessions }
})

function openSession(sid: string) {
  ui.focusSession(sid)
}

function openProject(pid: string, view: 'terminals' | 'overview') {
  ui.selectProject(pid)
  P.patch(pid, { view })
}
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden bg-[#1b1924]">
    <div ref="el" class="absolute inset-0" />

    <div class="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
      <div class="pointer-events-auto flex items-center gap-2 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-white backdrop-blur">
        <BrandMark :size="16" simple />
        <span class="font-brand text-[13px] font-semibold">Canopy workspace</span>
        <span class="text-[11px] text-white/55">
          {{ totals.rooms }} rooms · {{ totals.lit }} lit · {{ totals.sessions }} sessions<template v-if="totals.subagents"> · {{ totals.subagents }} subagents</template>
        </span>
      </div>
      <div class="text-[10.5px] text-white/40">Drag to pan · right-drag to turn · scroll to zoom · hover a big screen for its overview</div>
    </div>

    <div class="absolute right-3 top-3 flex gap-1.5">
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-home-01" label="Whole workspace" @click="picked = null; scene?.resetView()" />
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-cancel-01" title="Back to terminals" @click="ui.sim = false" />
    </div>

    <div v-if="hoverScreen" class="pointer-events-none absolute z-10" :style="cardAt(300, 340)">
      <SimulationOverview :pid="hoverScreen" />
    </div>

    <div v-else-if="hoverPerson" class="pointer-events-none absolute z-10 w-[240px] rounded-lg border border-(--ln) bg-(--win) px-3 py-2 text-(--tx) shadow-xl" :style="cardAt(240, 110)">
      <div class="flex items-center gap-1.5 text-[12.5px] font-semibold">
        <span class="h-2 w-2 rounded-full" :style="{ background: SC[hoverPerson.status] }" />
        {{ hoverPerson.name }}
        <span class="text-[11px] font-normal text-(--fa)">{{ hoverPerson.parentId ? 'Subagent' : hoverPerson.role === 'designer' ? 'Designer' : 'Developer' }}</span>
      </div>
      <div class="mt-1 line-clamp-2 text-[11.5px] text-(--mu)">{{ hoverPerson.title }}</div>
      <div v-if="hoverPerson.line" class="mt-1 line-clamp-2 text-[11.5px] italic text-(--tx2)">“{{ hoverPerson.line.text }}”</div>
      <div v-if="hoverPerson.parentId" class="mt-1 text-[11px] text-(--fa)">Helping {{ castFor(hoverPerson.parentId)?.name }}</div>
      <div v-else-if="sessionOf(hoverPerson)" class="mt-1 text-[11px] text-(--fa)">
        {{ SL[hoverPerson.status] }}<template v-if="sessionOf(hoverPerson)!.waitWhat"> · {{ sessionOf(hoverPerson)!.waitWhat }}</template> · {{ usd(S.cost(sessionOf(hoverPerson)!)) }}
      </div>
    </div>

    <div v-if="pickedRoom && !pickedPerson" class="absolute bottom-3 left-3 w-[280px] rounded-xl border border-(--ln) bg-(--win) p-3 text-(--tx) shadow-2xl">
      <div class="flex items-center gap-2 text-[13px] font-semibold">
        <span class="h-2.5 w-2.5 rounded-[3px]" :style="{ background: pcol(pickedRoom.hue) }" />
        {{ pickedRoom.name }}
      </div>
      <div class="mt-1 text-[11.5px] text-(--mu)">
        {{ pickedCount ? `${pickedCount} session${pickedCount === 1 ? '' : 's'} running` : 'No sessions running. The lights are off.' }}
      </div>
      <div class="mt-2.5 flex gap-1.5">
        <UButton size="xs" color="primary" label="Open terminals" @click="openProject(pickedRoom.id, 'terminals')" />
        <UButton size="xs" color="neutral" variant="subtle" label="Overview" @click="openProject(pickedRoom.id, 'overview')" />
      </div>
    </div>

    <!-- Not dismissible: Esc belongs to the terminal, where it interrupts Claude. -->
    <UModal
      v-model:open="talkOpen"
      :dismissible="false"
      :close="false"
      :ui="{
        overlay: 'bg-black/45',
        content: 'flex h-[min(78vh,760px)] w-[min(92vw,1100px)] max-w-none flex-col overflow-hidden bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0',
      }"
    >
      <template #content>
        <div v-if="talkSession && talkProject" class="flex min-h-0 flex-1 flex-col">
          <div class="flex h-11 flex-none items-center gap-2.5 border-b border-(--ln) px-3.5">
            <span class="h-2 w-2 flex-none rounded-full" :style="{ background: SC[talkSession.status] }" />
            <span class="flex-none text-[13px] font-semibold text-(--tx)">{{ talkCast?.name }}</span>
            <span class="flex-none text-[11.5px] text-(--fa)">{{ talkCast?.role === 'designer' ? 'Designer' : 'Developer' }} in</span>
            <span class="flex flex-none items-center gap-1.5 text-[12px] text-(--tx2)">
              <span class="h-2 w-2 rounded-[2px]" :style="{ background: pcol(talkProject.hue) }" />{{ talkProject.name }}
            </span>
            <span class="ellipsis min-w-0 flex-1 text-[12px] text-(--mu)">{{ talkSession.title }}</span>
            <span v-if="talkHelpers" class="flex-none text-[11px] text-(--fa)">{{ talkHelpers }} subagent{{ talkHelpers === 1 ? '' : 's' }} helping</span>
            <span class="mono flex-none text-[11px] text-(--fa)">{{ usd(S.cost(talkSession)) }}</span>
            <UButton size="xs" color="neutral" variant="subtle" label="Open in terminals" @click="openSession(talkSession.id)" />
            <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Close" @click="talkTo = null" />
          </div>
          <TerminalPane :key="talkSession.id" :session="talkSession" :multi="false" :focused="true" :narrow="false" class="min-h-0 flex-1" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style>
/* Name tags over people's heads, drawn by the scene's label renderer. */
/* No height and items packed at the end, so the name chip stays put and bubbles grow upwards from it. */
.sim-tag { height: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; pointer-events: none; }
.sim-chip { display: flex; align-items: center; gap: 5px; padding: 2px 7px 2px 6px; border-radius: 999px; background: rgba(20, 18, 28, .78); color: #fff; font-size: 11px; line-height: 15px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0, 0, 0, .3); }
.sim-chip i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.sim-chip b { font-weight: 600; }
.sim-chip span { color: rgba(255, 255, 255, .55); font-size: 10px; }
.sim-chip-sub { background: rgba(70, 40, 110, .82); }
.sim-bubble { min-width: 22px; padding: 1px 6px; border-radius: 10px; background: #fff; color: #1d1b20; font-size: 12px; font-weight: 700; text-align: center; box-shadow: 0 2px 6px rgba(0, 0, 0, .3); }
.sim-bubble-wait { background: #f5b544; animation: sim-bob 0.9s ease-in-out infinite; }
@keyframes sim-bob { 50% { transform: translateY(-3px); } }
/* What Claude is saying, or doing, over its character's head while it works. */
.sim-say { position: relative; max-width: 220px; width: max-content; margin-bottom: 4px; padding: 5px 9px; border-radius: 10px; background: #fff; color: #1d1b20; font-size: 11px; line-height: 14px; text-align: center; white-space: normal; box-shadow: 0 3px 10px rgba(0, 0, 0, .35); animation: sim-pop .25s ease-out; }
.sim-say::after { content: ''; position: absolute; left: 50%; bottom: -5px; margin-left: -5px; border: 5px solid transparent; border-bottom: 0; border-top-color: #fff; }
.sim-say-doing { background: rgba(20, 18, 28, .85); color: rgba(255, 255, 255, .85); font-style: italic; font-size: 10.5px; padding: 3px 8px; }
.sim-say-doing::before { content: '⚙ '; font-style: normal; }
.sim-say-doing::after { border-top-color: rgba(20, 18, 28, .85); }
@keyframes sim-pop { from { transform: scale(.6); opacity: 0; } }
</style>
