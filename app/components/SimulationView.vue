<script setup lang="ts">
// The workspace simulation: every project as a room and every Claude session and subagent as a
// person in it, drawn in 3D by WorkspaceScene.
import type { Session } from '#shared/types'
import { useEventListener } from '@vueuse/core'
import { skyOf, useWeather } from '~/composables/useWeather'
import { simGlassOf } from '~/stores/prefs'
import { castFor, castOf } from '~/simulation/cast'
import { type Pick, type SimHover, type SimPerson, type SimRoom, WorkspaceScene } from '~/simulation/scene'

const P = useProjectsStore()
const S = useSessionsStore()
const ui = useUiStore()
const prefs = usePrefsStore()

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
      id: s.id, roomId: s.pid, parentId: null, name: cast.get(s.id)!.name, role: cast.get(s.id)!.role, status: s.status, title: s.title, line: S.chatter[s.id] || null, act: S.activity[s.id]?.act || ('' as const), result: S.activity[s.id]?.result || null,
    })),
    ...subs.map(({ s, a }) => ({
      id: a.id, roomId: s.pid, parentId: s.id, name: cast.get(a.id)!.name, role: cast.get(a.id)!.role, status: 'working' as const, title: a.desc || a.type, line: null, act: '' as const, result: null,
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
      menu.value = null
      // A person opens their session, or a subagent the session that started it, in a modal.
      if (p?.kind === 'person') {
        const who = people.value.find(x => x.id === p.id)
        if (who) talkTo.value = who.parentId || who.id
      }
    },
    onMenu: (m) => {
      hover.value = null
      menu.value = { id: m.pick.id, x: m.x, y: m.y }
    },
    onFarewell: id => S.close(id),
  })
  scene.sync(rooms.value, people.value)
  paintSky()
})

/** A session or project clicked in the sidebar: fly to their character, and keep up with them, or to the room. A double click opens the session too. */
watch(() => ui.simTarget, (t) => {
  if (!t) return
  if (t.kind === 'person' && !people.value.some(p => p.id === t.id)) return
  if (t.kind === 'room' && !rooms.value.some(r => r.id === t.id)) return
  menu.value = null
  const pick: Pick = { kind: t.kind, id: t.id }
  picked.value = pick
  scene?.focus(pick)
  if (t.talk && t.kind === 'person') talkTo.value = t.id
})

/** Tab and Shift Tab fly between the sessions waiting on you, while nothing else has the keyboard. */
useEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || talkOpen.value || menu.value) return
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, [contenteditable], .xterm, [role="dialog"]')) return
  e.preventDefault()
  ui.simNextWaiting(e.shiftKey ? -1 : 1)
})

// ---------- Day, night and the weather ----------

const { weather } = useWeather()

/** The light follows the local time and the sky the weather outside, updated every minute. */
function paintSky() {
  const d = new Date()
  const w = weather.value
  scene?.setSky({
    hour: d.getHours() + d.getMinutes() / 60,
    sunrise: w?.sunrise ?? 6,
    sunset: w?.sunset ?? 18,
    sky: w ? skyOf(w.code, w.day).sky : null,
  })
}
watch([() => Math.floor(ui.now / 60_000), weather], paintSky)

// ---------- The session window: see-through, toggled by a shortcut ----------

/** How solid the session window is, in %: never fully, so the characters always show through it and its terminal. */
const glass = computed(() => simGlassOf(prefs.prefs))

watch(() => talkTo.value, (sid, was) => {
  if (was && was !== sid) setSeeThrough(was, false)
  if (sid) setSeeThrough(sid, true)
})

/** The shortcut opens the session of the character in view (or the one a subagent works for), or closes the open one. */
watch(() => ui.simTalk, () => {
  if (talkTo.value) {
    talkTo.value = null
    return
  }
  const p = pickedPerson.value
  if (p) talkTo.value = p.parentId || p.id
})

// The sidebar shows the session of the character in view, or the room's project, as selected.
watch(() => picked.value, (pick) => {
  if (!pick) return
  if (pick.kind === 'person') {
    const p = people.value.find(x => x.id === pick.id)
    const s = p ? S.byId(p.parentId || p.id) : null
    if (!s) return
    P.sel = s.pid
    S.setFocus(s.pid, s.id)
    P.patch(s.pid, { expanded: true })
  } else if (P.byId(pick.id)) {
    P.sel = pick.id
  }
})

// ---------- Right-click menu on a person ----------

const menu = ref<{ id: string; x: number; y: number } | null>(null)
const menuPerson = computed(() => (menu.value ? people.value.find(p => p.id === menu.value!.id) || null : null))

/** The session the menu is for, while it waits on you. */
const menuWaiting = computed(() => {
  const s = menuPerson.value && !menuPerson.value.parentId ? S.byId(menuPerson.value.id) : null
  return s?.status === 'waiting' ? s : null
})

// Answered: the menu has done its job.
watch(() => menuPerson.value?.status, (now, was) => {
  if (was === 'waiting' && now !== 'waiting') menu.value = null
})

function menuOpen() {
  const p = menuPerson.value
  menu.value = null
  if (p) talkTo.value = p.parentId || p.id
}

function menuTerminals() {
  const p = menuPerson.value
  menu.value = null
  if (p) openSession(p.parentId || p.id)
}

/** They wave goodbye, then the session closes and they vanish. */
function menuClose() {
  const p = menuPerson.value
  menu.value = null
  if (p && !p.parentId) scene?.farewell(p.id)
}

onBeforeUnmount(() => {
  if (talkTo.value) setSeeThrough(talkTo.value, false)
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

/**
 * A new Claude session in a room, without leaving the workspace: they are summoned at a desk.
 * In a repo that already has a session it gets its own worktree, as the New session button does.
 */
async function addSession(pid: string, repoId: string) {
  const p = P.byId(pid)
  const r = p?.repos.find(x => x.id === repoId)
  if (!p || !r) return
  const s = await S.start(p, r, { wt: S.sessions.some(x => x.repoId === r.id && !x.wt) })
  if (s) S.setFocus(p.id, s.id)
}

const addItems = computed(() => (pickedRoom.value?.repos || []).map(r => ({ label: r.label, onSelect: () => addSession(pickedRoom.value!.id, r.id) })))

/** After asking, everyone in the room waves goodbye together, then their sessions close. */
function closeRoom(pid: string) {
  const ids = people.value.filter(p => p.roomId === pid && !p.parentId).map(p => p.id)
  if (!ids.length) return
  const name = P.byId(pid)?.name || 'this project'
  ui.confirm = {
    title: `Close all ${ids.length} session${ids.length === 1 ? '' : 's'}?`,
    body: `Ends every Claude session in ${name}. Shells and dev servers keep running.`,
    ok: 'Close all',
    run: () => ids.forEach(id => scene?.farewell(id)),
  }
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
      <div class="text-[10.5px] text-white/40">Drag to pan · right-drag to turn · scroll to zoom · right-click someone for options · Tab to visit whoever is waiting on you · {{ prefs.kl('simTalk') }} to open or close their session</div>
    </div>

    <div class="absolute right-3 top-3 flex gap-1.5">
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-home-01" label="Whole workspace" @click="picked = null; scene?.resetView()" />
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-cancel-01" title="Back to terminals" @click="ui.sim = false" />
    </div>

    <SimulationWeather class="absolute bottom-3 right-3" />

    <template v-if="menu && menuPerson">
      <!-- Windows fires contextmenu after the release that opened the menu, onto this overlay: it must not close it. -->
      <div class="absolute inset-0 z-20" @pointerdown="menu = null" @contextmenu.prevent />
      <div
        class="absolute z-30 min-w-[190px] max-w-[320px] rounded-lg border border-(--ln) bg-(--win) p-1 text-(--tx) shadow-xl"
        :style="{ left: Math.min(menu.x, (el?.clientWidth ?? 9999) - 328) + 'px', top: Math.min(menu.y, (el?.clientHeight ?? 9999) - (menuWaiting ? 210 : 130)) + 'px' }"
        @keydown.esc="menu = null"
      >
        <div class="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold">
          <span class="h-2 w-2 rounded-full" :style="{ background: SC[menuPerson.status] }" />
          {{ menuPerson.name }}
          <span class="font-normal text-(--fa)">{{ menuPerson.parentId ? 'Subagent' : menuPerson.role === 'designer' ? 'Designer' : 'Developer' }}</span>
        </div>
        <!-- Waiting on you: what Claude is asking, with its choices to answer right here. -->
        <div v-if="menuWaiting" class="mx-1 mb-1 rounded-md bg-(--ambf)/15 px-2 py-1.5">
          <div class="line-clamp-3 text-[11.5px] text-(--tx2)">{{ menuWaiting.waitWhat || 'Waiting for input' }}</div>
          <AnswerButtons :sid="menuWaiting.id" class="mt-1.5 flex-wrap" />
        </div>
        <button class="sim-menu-item" @click="menuOpen">{{ menuPerson.parentId ? `Talk to ${castFor(menuPerson.parentId)?.name}` : 'Talk to them' }}</button>
        <button class="sim-menu-item" @click="menuTerminals">Open in terminals</button>
        <button v-if="!menuPerson.parentId" class="sim-menu-item text-(--red)" @click="menuClose">Close</button>
      </div>
    </template>

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

    <div v-if="pickedRoom && !pickedPerson" class="absolute bottom-3 left-3 min-w-[240px] rounded-xl border border-white/10 bg-black/45 px-3.5 py-3 text-white backdrop-blur">
      <div class="flex items-center gap-2 text-[13px] font-semibold">
        <span class="h-2.5 w-2.5 rounded-[3px]" :style="{ background: pcol(pickedRoom.hue) }" />
        {{ pickedRoom.name }}
      </div>
      <div class="mt-1 text-[11.5px] text-white/55">
        {{ pickedCount ? `${pickedCount} session${pickedCount === 1 ? '' : 's'} running` : 'No sessions running. The lights are off.' }}
      </div>
      <div class="mt-2.5 flex flex-nowrap gap-1.5 whitespace-nowrap">
        <template v-if="pickedRoom.repos.length">
          <UButton v-if="pickedRoom.repos.length === 1" size="xs" color="primary" icon="i-hugeicons-add-01" label="Add session" @click="addSession(pickedRoom.id, pickedRoom.repos[0]!.id)" />
          <UDropdownMenu v-else :items="addItems" :content="{ align: 'start', side: 'top', sideOffset: 4 }" :ui="{ content: 'w-[200px]' }">
            <UButton size="xs" color="primary" icon="i-hugeicons-add-01" trailing-icon="i-hugeicons-arrow-up-01" label="Add session" />
          </UDropdownMenu>
        </template>
        <UButton size="xs" color="neutral" variant="outline" class="bg-transparent text-white ring-white/20 hover:bg-white/10" label="Open terminals" @click="openProject(pickedRoom.id, 'terminals')" />
        <UButton size="xs" color="neutral" variant="outline" class="bg-transparent text-white ring-white/20 hover:bg-white/10" label="Overview" @click="openProject(pickedRoom.id, 'overview')" />
        <UButton v-if="pickedCount" size="xs" color="neutral" variant="outline" class="bg-transparent text-[#ff8a80] ring-[#ff8a80]/40 hover:bg-[#ff8a80]/15" label="Close all" @click="closeRoom(pickedRoom.id)" />
      </div>
    </div>

    <!-- A click outside closes it, Esc does not: Esc belongs to the terminal, where it interrupts Claude. -->
    <UModal
      v-model:open="talkOpen"
      :content="{ onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault() }"
      :close="false"
      :ui="{
        overlay: 'bg-black/10',
        content: 'flex h-[min(78vh,760px)] w-[min(92vw,1100px)] max-w-none flex-col overflow-hidden bg-transparent border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0',
      }"
    >
      <template #content>
        <div
          v-if="talkSession && talkProject"
          class="sim-glass flex min-h-0 flex-1 flex-col"
          :style="{ '--glass': glass + '%' }"
        >
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
            <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" :title="`Close (${prefs.kl('simTalk')})`" @click="talkTo = null" />
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
/* The see-through session window: one tinted, lightly blurred backdrop, with the terminal inside it clear.
   The terminal pane sets its own colours under .dark, so they are cleared there too. */
.sim-glass, .sim-glass .dark { --term: transparent; --chrome: transparent; --head: transparent; }
.sim-glass { background: color-mix(in oklch, var(--modal) var(--glass), transparent); backdrop-filter: blur(2px); }
.sim-menu-item { display: flex; width: 100%; align-items: center; height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12px; text-align: left; cursor: pointer; }
.sim-menu-item:hover { background: var(--hov); }
</style>
