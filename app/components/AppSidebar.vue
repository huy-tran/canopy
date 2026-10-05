<script setup lang="ts">
import type { ContextMenuItem } from '@nuxt/ui'
import type { Project, Session } from '#shared/types'

defineProps<{ rail: boolean }>()

const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const prefs = usePrefsStore()
const costs = useCostsStore()

const waitStyle = computed(() => prefs.prefs.waitStyle || 'both')
const hl = computed(() => waitStyle.value !== 'badge')
const pill = computed(() => waitStyle.value !== 'highlight')

function waitingOf(pid: string) {
  return S.ofProject(pid).filter(s => s.status === 'waiting').length
}

function sAgo(s: Session) {
  if (s.status === 'working') return 'now'
  const t = s.status === 'waiting' ? (s.waitingSince || s.lastAt) : (s.endedAt || s.lastAt || s.started)
  return ago(ui.now - t)
}

function waitAgo(s: Session) {
  const a = ago(ui.now - (s.waitingSince || ui.now))
  return a === 'now' ? '<1m' : a
}

function costText(p: Project) {
  if (!prefs.prefs.showCost) return ''
  const c = costs.today(p.id)
  return c > 0 ? usd(c) : '-'
}

function rowBg(p: Project) {
  if (waitingOf(p.id) && hl.value) return 'var(--ambs)'
  return p.id === P.sel ? 'var(--sel)' : 'transparent'
}

function sessBg(s: Session, p: Project) {
  return p.id === P.sel && s.id === ui.fid ? 'var(--sel)' : 'transparent'
}

function toggleExpanded(p: Project) {
  P.patch(p.id, { expanded: !p.expanded })
}

// ---------- Starred and Projects sections, reordered by dragging ----------
const sections = computed(() => [
  { key: 'starred', label: 'Starred', starred: true, list: P.starred },
  { key: 'projects', label: 'Projects', starred: false, list: P.unstarred },
])
/** The project being dragged, and where it would land. */
const dragId = ref<string | null>(null)
const over = ref<{ id: string; after: boolean } | null>(null)
/** The section whose empty drop zone is under the pointer. */
const overSection = ref<boolean | null>(null)
/** Starred shows while it holds projects, or while dragging one that could be starred. */
const starredShown = computed(() => P.starred.length > 0 || (!!dragId.value && !P.byId(dragId.value)?.starred))

function onDragStart(e: DragEvent, p: Project) {
  dragId.value = p.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', p.id)
  }
}

function onDragOver(e: DragEvent, p: Project) {
  if (!dragId.value) return
  e.preventDefault()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  over.value = dragId.value === p.id ? null : { id: p.id, after: e.clientY > r.top + r.height / 2 }
}

function onDrop(p: Project) {
  if (dragId.value && over.value?.id === p.id) P.move(dragId.value, p.id, over.value.after)
  onDragEnd()
}

function onZoneOver(e: DragEvent, starred: boolean) {
  if (!dragId.value) return
  e.preventDefault()
  overSection.value = starred
}

function onZoneDrop(starred: boolean) {
  if (dragId.value) P.patch(dragId.value, { starred })
  onDragEnd()
}

function onDragEnd() {
  dragId.value = null
  over.value = null
  overSection.value = null
}

function dropLine(p: Project) {
  if (over.value?.id !== p.id) return undefined
  return over.value.after ? '0 2px 0 0 var(--lnk)' : '0 -2px 0 0 var(--lnk)'
}

function ctxItems(p: Project): ContextMenuItem[] {
  return [
    { label: p.starred ? 'Unstar' : 'Star', onSelect: () => P.toggleStar(p.id) },
    { label: 'Open terminals', onSelect: () => { ui.selectProject(p.id); P.patch(p.id, { view: 'terminals' }) } },
    { label: 'Overview', onSelect: () => { P.sel = p.id; P.patch(p.id, { view: 'overview' }) } },
    { label: 'Start all sessions', onSelect: () => ui.startAll(p.id) },
    { label: 'Daily summary…', onSelect: () => ui.openSummary(p.id) },
    { label: 'Edit project…', onSelect: () => ui.openModal('edit', p.id) },
    { label: 'Delete project…', class: 'text-(--red)', onSelect: () => ui.openModal('edit', p.id, true) },
  ]
}

const ctxUi = { content: 'w-[200px]', item: 'px-2.5 text-[12px]' }
</script>

<template>
  <!-- Full sidebar -->
  <div v-if="!rail" class="flex h-full w-[264px] flex-col">
    <div v-if="ui.waitList.length" class="flex flex-col gap-px border-b border-(--ln2) px-2.5 pb-2.5 pt-3">
      <div class="flex h-6 items-center justify-between px-1.5">
        <span class="label-caps">Waiting on you</span>
        <div class="flex items-center gap-2">
          <span
            :title="`Answer them one by one (${prefs.kl('inbox')})`"
            class="cursor-pointer text-[11px] text-(--amb) hover:underline"
            @click="ui.toggleInbox()"
          >Open inbox</span>
          <span class="mono rounded-lg bg-(--ambf) px-1.5 text-[10.5px] font-bold text-[#131417]">{{ ui.waitList.length }}</span>
        </div>
      </div>
      <div
        v-for="s in ui.waitList"
        :key="s.id"
        class="flex cursor-pointer flex-col rounded-md px-1.5 hover:bg-(--hov)"
        @click="ui.focusSession(s.id)"
      >
        <div class="flex h-[30px] items-center gap-2">
          <span class="h-2 w-2 flex-none rounded-xs" :style="{ background: pcol(P.byId(s.pid)?.hue ?? 0) }" />
          <span class="whitespace-nowrap text-[13px] text-(--tx)">{{ P.byId(s.pid)?.name.split(' ')[0] }}</span>
          <span class="chip-repo">{{ P.repoOf(s.pid, s.repoId).label }}</span>
          <span class="ellipsis flex-1 text-[12px] text-(--mu)">{{ s.waitWhat || 'Waiting for input' }}</span>
          <span class="mono text-[11px] text-(--amb)">{{ waitAgo(s) }}</span>
        </div>
        <AnswerButtons :sid="s.id" compact class="-mt-0.5 mb-1.5 pl-4" />
      </div>
    </div>

    <!-- Starred keeps at most 40% of the height so Projects stays reachable; each scrolls on its own. -->
    <template v-for="sec in sections" :key="sec.key">
    <div
      v-if="!sec.starred || starredShown"
      class="flex min-h-0 flex-col"
      :class="sec.starred ? 'max-h-[40%] flex-none border-b border-(--ln2)' : 'flex-1'"
    >
    <div class="flex items-center justify-between pb-2 pl-4 pr-3 pt-3.5">
      <span class="label-caps">{{ sec.label }}</span>
      <UTooltip v-if="!sec.starred" :text="`New project (${prefs.kl('newProject')})`">
        <span class="grid h-5 w-5 cursor-pointer place-items-center rounded-sm text-(--mu) hover:bg-(--hov) hover:text-(--tx)" @click="ui.openModal('add')"><UIcon name="i-hugeicons-add-01" class="size-3.5" /></span>
      </UTooltip>
    </div>

    <div class="flex min-h-0 flex-col gap-1.5 overflow-auto px-2.5 pb-3 pt-0.5" :class="{ 'flex-1': !sec.starred }">
      <div
        v-if="dragId && !sec.list.length"
        class="grid h-[34px] flex-none place-items-center rounded-md border border-dashed text-[12px]"
        :class="overSection === sec.starred ? 'border-(--lnk) text-(--tx)' : 'border-(--fa) text-(--fa)'"
        @dragover="onZoneOver($event, sec.starred)"
        @dragleave="overSection = null"
        @drop.prevent="onZoneDrop(sec.starred)"
      >{{ sec.starred ? 'Drop here to star' : 'Drop here to unstar' }}</div>
      <div
        v-for="p in sec.list"
        :key="p.id"
        class="flex flex-none flex-col gap-0.5 rounded-md"
        :class="{ 'opacity-50': dragId === p.id }"
        :style="{ boxShadow: dropLine(p) }"
        @dragover="onDragOver($event, p)"
        @drop.prevent="onDrop(p)"
      >
        <UContextMenu :items="ctxItems(p)" :ui="ctxUi">
          <div
            class="group flex h-[34px] cursor-pointer items-center gap-2.5 rounded-md pl-0.5 pr-1.5 hover:brightness-[1.12]"
            :style="{ background: rowBg(p) }"
            draggable="true"
            @dragstart="onDragStart($event, p)"
            @dragend="onDragEnd"
            @click="ui.selectProject(p.id)"
          >
            <span class="grid h-5 w-[14px] place-items-center text-(--fa)" @click.stop="toggleExpanded(p)"><UIcon :name="p.expanded ? 'i-hugeicons-arrow-down-01' : 'i-hugeicons-arrow-right-01'" class="size-3" /></span>
            <UAvatar
              :text="p.ini"
              :ui="{ root: 'h-5 w-5 flex-none rounded-md', fallback: 'text-[9px] font-bold text-[#121316] leading-none' }"
              :style="{ background: pcol(p.hue) }"
            />
            <span
              class="ellipsis flex-1 text-[13.5px] font-medium"
              :style="{ color: waitingOf(p.id) && hl ? 'var(--ambtx)' : 'var(--tx)' }"
            >{{ p.name }}</span>
            <UBadge
              v-if="waitingOf(p.id) && pill"
              :label="String(waitingOf(p.id))"
              :ui="{ base: 'mono h-4 min-w-4 justify-center rounded-lg bg-(--ambf) px-1 text-[10px] font-bold text-[#131417] ring-0' }"
            />
            <UTooltip :text="p.starred ? 'Unstar' : 'Star'">
              <span
                class="grid h-5 w-5 flex-none place-items-center rounded-sm hover:bg-(--hov)"
                :class="p.starred ? 'text-(--amb)' : 'text-(--fa) opacity-0 group-hover:opacity-100 hover:text-(--tx)'"
                @click.stop="P.toggleStar(p.id)"
              ><UIcon name="i-hugeicons-star" class="size-3.5" /></span>
            </UTooltip>
            <span v-if="prefs.prefs.showCost" class="mono min-w-10 text-right text-[11.5px] text-(--fa)">{{ costText(p) }}</span>
          </div>
        </UContextMenu>
        <UCollapsible :open="p.expanded" :ui="{ content: 'flex flex-col gap-0.5' }">
          <template #content>
          <div
            v-for="s in S.ofProject(p.id)"
            :key="s.id"
            class="flex h-[30px] cursor-pointer items-center gap-2 rounded-md pl-[34px] pr-1.5 hover:bg-(--hov)"
            :style="{ background: sessBg(s, p) }"
            @click.stop="ui.focusSession(s.id)"
          >
            <UIcon v-if="s.kind === 'shell'" name="i-hugeicons-command-line" class="size-3 flex-none text-(--mu)" />
            <span v-else class="h-1.5 w-1.5 flex-none rounded-full" :style="{ background: SC[s.status] }" />
            <span class="chip-repo">{{ P.repoOf(p.id, s.repoId).label }}</span>
            <UIcon v-if="s.wt" title="Git worktree" name="i-hugeicons-git-fork" class="size-3 flex-none text-(--teal)" />
            <span class="ellipsis flex-1 text-[12.5px]" :style="{ color: s.status === 'waiting' ? 'var(--tx)' : 'var(--tx3)' }">{{ s.title }}</span>
            <span class="mono text-[11px] text-(--fa)">{{ sAgo(s) }}</span>
          </div>
          <div v-if="!S.ofProject(p.id).length" class="flex h-[30px] items-center gap-1.5 pl-[34px] text-[12.5px] text-(--fa)">
            No sessions running<span class="cursor-pointer text-(--lnk)" @click.stop="ui.startAll(p.id)">Start</span>
          </div>
          </template>
        </UCollapsible>
      </div>
    </div>
    </div>
    </template>

    <div class="flex items-center gap-1.5 border-t border-(--ln2) px-2.5 py-2">
      <div
        class="flex h-8 flex-1 cursor-pointer items-center justify-between rounded-md px-2 text-[13px] text-(--tx3) hover:bg-(--hov) hover:text-(--tx)"
        @click="ui.openModal('add')"
      >
        <span class="flex items-center gap-1.5"><UIcon name="i-hugeicons-add-01" class="size-3" />New project</span><span class="mono text-[11px] text-(--fa)">{{ prefs.kl('newProject') }}</span>
      </div>
      <UTooltip :text="`Collapse sidebar (${prefs.kl('sidebar')})`">
        <div class="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-md text-(--mu) hover:bg-(--hov) hover:text-(--tx)" @click="ui.toggleSidebar()"><UIcon name="i-hugeicons-arrow-left-double" class="size-3.5" /></div>
      </UTooltip>
    </div>
  </div>

  <!-- Icon rail -->
  <div v-else class="flex h-full w-[52px] flex-col items-center gap-1 py-2.5">
    <UTooltip :text="`Next session waiting on you (${prefs.kl('nextWaiting')})`" :content="{ side: 'right' }">
      <div
        class="grid h-7 w-8 cursor-pointer place-items-center rounded-lg"
        :style="{ background: ui.waitList.length ? 'var(--ambs)' : 'transparent' }"
        @click="ui.nextWaiting()"
      >
        <span class="mono text-[11px] font-bold" :style="{ color: ui.waitList.length ? 'var(--amb)' : 'var(--fa)' }">{{ ui.waitList.length }}</span>
      </div>
    </UTooltip>
    <div class="my-1 h-px w-6 flex-none bg-(--ln)" />
    <div class="flex min-h-0 [scrollbar-width:none] w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
    <template v-for="sec in sections" :key="sec.key">
    <div v-if="!sec.starred && P.starred.length && P.unstarred.length" class="my-1 h-px w-6 flex-none bg-(--ln)" />
    <UPopover
      v-for="p in sec.list"
      :key="p.id"
      mode="hover"
      :open-delay="60"
      :close-delay="180"
      :content="{ side: 'right', align: 'start', sideOffset: 2 }"
      :ui="{ content: 'w-[270px] rounded-lg p-1.5' }"
    >
      <UContextMenu :items="ctxItems(p)" :ui="ctxUi">
        <div
          class="relative grid h-9 w-[52px] flex-none cursor-pointer place-items-center"
          :class="{ 'opacity-50': dragId === p.id }"
          :style="{ boxShadow: dropLine(p) }"
          draggable="true"
          @dragstart="onDragStart($event, p)"
          @dragend="onDragEnd"
          @dragover="onDragOver($event, p)"
          @drop.prevent="onDrop(p)"
          @click="ui.selectProject(p.id)"
        >
          <span class="absolute left-0 top-[9px] h-[18px] w-[3px] rounded-r-xs" :style="{ background: p.id === P.sel ? pcol(p.hue) : 'transparent' }" />
          <UChip
            :show="waitingOf(p.id) > 0"
            position="top-right"
            :ui="{ base: 'h-2.5 w-2.5 border-2 border-(--chrome) bg-(--ambf) ring-0 -translate-y-px translate-x-px' }"
          >
            <UAvatar
              :text="p.ini"
              :ui="{ root: 'h-[30px] w-[30px] rounded-lg', fallback: 'text-[10.5px] font-bold text-[#121316] leading-none' }"
              :style="{ background: pcol(p.hue) }"
            />
          </UChip>
        </div>
      </UContextMenu>
      <template #content>
        <div class="flex flex-col gap-px">
          <div class="flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-(--hov)" @click="ui.selectProject(p.id)">
            <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: pcol(p.hue) }" />
            <span class="flex-1 text-[12.5px] font-semibold text-(--tx)">{{ p.name }}</span>
            <span class="mono text-[10.5px] text-(--fa)">{{ usd(costs.today(p.id)) }}</span>
          </div>
          <div
            v-for="s in S.ofProject(p.id)"
            :key="s.id"
            class="flex h-[26px] cursor-pointer items-center gap-[7px] rounded-md px-1.5 hover:bg-(--hov)"
            @click="ui.focusSession(s.id)"
          >
            <UIcon v-if="s.kind === 'shell'" name="i-hugeicons-command-line" class="size-3 flex-none text-(--mu)" />
            <span v-else class="h-1.5 w-1.5 flex-none rounded-full" :style="{ background: SC[s.status] }" />
            <span class="chip-repo">{{ P.repoOf(p.id, s.repoId).label }}</span>
            <UIcon v-if="s.wt" title="Git worktree" name="i-hugeicons-git-fork" class="size-3 flex-none text-(--teal)" />
            <span class="ellipsis flex-1 text-[11.5px]" :style="{ color: s.status === 'waiting' ? 'var(--tx)' : 'var(--tx3)' }">{{ s.title }}</span>
            <span class="mono text-[10px] text-(--fa)">{{ sAgo(s) }}</span>
          </div>
          <div v-if="!S.ofProject(p.id).length" class="flex h-[26px] items-center gap-1.5 px-1.5 text-[11.5px] text-(--fa)">
            No sessions running<span class="cursor-pointer text-(--lnk)" @click.stop="ui.startAll(p.id)">Start all</span>
          </div>
        </div>
      </template>
    </UPopover>
    </template>
    </div>
    <UTooltip text="New project" :content="{ side: 'right' }">
      <div
        class="box-border grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-lg border border-dashed border-(--fa) text-[15px] text-(--mu) hover:border-(--tx3) hover:text-(--tx)"
        @click="ui.openModal('add')"
      >+</div>
    </UTooltip>
    <UTooltip :text="`Expand sidebar (${prefs.kl('sidebar')})`" :content="{ side: 'right' }">
      <div class="mt-1 grid h-[26px] w-[30px] cursor-pointer place-items-center rounded-md text-(--mu) hover:bg-(--hov) hover:text-(--tx)" @click="ui.toggleSidebar()"><UIcon name="i-hugeicons-arrow-right-double" class="size-3.5" /></div>
    </UTooltip>
  </div>
</template>
