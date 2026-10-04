<script setup lang="ts">
import type { Project } from '#shared/types'

const props = defineProps<{ project: Project }>()

const ui = useUiStore()
const S = useSessionsStore()

const ss = computed(() => S.ofProject(props.project.id))
const inboxS = computed(() => (ui.inbox?.sid ? S.byId(ui.inbox.sid) : null))
const visible = computed(() => {
  if (inboxS.value && inboxS.value.pid === props.project.id) return [inboxS.value]
  return props.project.layout === 'tabs' ? ss.value.filter(s => s.id === ui.fid) : ss.value
})
const layout = computed(() => props.project.layout)
const multi = computed(() => layout.value !== 'tabs' && visible.value.length > 1)
const prefs = usePrefsStore()
/** Width taken by the dock panel when it is open on the right. */
const dockW = computed(() => (ui.logsOpen && prefs.prefs.panelDock === 'right' ? prefs.prefs.panelSize?.right ?? 460 : 0))
const mainW = computed(() => ui.width - (ui.collapsed ? 52 : 264) - dockW.value)
const paneW = computed(() => layout.value === 'split' ? mainW.value / Math.max(1, visible.value.length) : layout.value === 'grid' && visible.value.length > 1 ? mainW.value / 2 : mainW.value)
const gridCols = computed(() => layout.value === 'split'
  ? `repeat(${Math.max(1, visible.value.length)}, minmax(0,1fr))`
  : layout.value === 'grid' && visible.value.length > 1 ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)')
</script>

<template>
  <div
    v-if="visible.length"
    class="grid min-h-0 flex-1"
    :style="{ gridTemplateColumns: gridCols, gridAutoRows: 'minmax(0,1fr)', gap: multi ? '6px' : '0', padding: multi ? '6px' : '0' }"
  >
    <TerminalPane
      v-for="s in visible"
      :key="s.id"
      :session="s"
      :multi="multi"
      :focused="s.id === ui.fid"
      :narrow="paneW < 560"
    />
  </div>

  <div v-else class="grid flex-1 place-items-center bg-(--term) p-6">
    <div class="flex w-full max-w-[440px] flex-col items-center gap-3.5 text-center">
      <div class="text-[14px] font-semibold">No sessions running</div>
      <div class="text-[12.5px] leading-normal text-(--mu)">Start Claude Code in every repo, or pick one.</div>
      <div class="flex w-full flex-col gap-1.5">
        <div
          v-for="r in project.repos"
          :key="r.id"
          class="flex h-[38px] cursor-pointer items-center gap-2.5 rounded-lg border border-(--ln) bg-(--chrome) px-3 text-left hover:border-(--bb) hover:bg-(--hov)"
          @click="ui.newSession(r.id, false)"
        >
          <span class="mono rounded-sm bg-(--chip) px-[5px] py-px text-[10.5px] text-(--tx2)">{{ r.label }}</span>
          <span class="ellipsis mono flex-1 text-[11.5px] text-(--tx3)">{{ r.path }}</span>
          <span class="mono text-[11px] text-(--fa)">{{ r.cmd }}</span>
        </div>
      </div>
      <UButton color="primary" size="md" :label="`Start all · ${project.repos.length}`" @click="ui.startAll(project.id)" />
    </div>
  </div>
</template>
