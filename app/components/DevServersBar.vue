<script setup lang="ts">
import type { Repo, Service } from '#shared/types'

// The dev servers of the project, shown only while one is running or has stopped on its own, so a crashed
// queue worker is not missed. Serve (Lookout's header, the palette, its shortcut) is what starts them.
const ui = useUiStore()
const P = useProjectsStore()
const V = useServicesStore()

const SVC: Record<string, string> = { running: 'var(--grn)', starting: 'var(--ambf)', stopped: 'var(--idle)' }

const cur = computed(() => P.current)
const list = computed(() => V.ofProject(cur.value))
const tabId = computed(() => (list.value.some(v => v.id === ui.svcTab) ? ui.svcTab : list.value[0]?.id))
const anyRun = computed(() => list.value.some(v => V.status(v.id) !== 'stopped'))
const visible = computed(() => anyRun.value || list.value.some(v => V.died[v.id]))

function openUrl(port: string) {
  api.sys.openExternal('http://localhost:' + port)
}

function toggle(v: Service & { repo: Repo }) {
  if (V.status(v.id) === 'stopped') V.start(v, v.repo)
  else V.stop(v.id)
}

function allAction() {
  if (anyRun.value) V.stopProject(cur.value)
  else V.dismissDied(list.value.map(v => v.id))
}
</script>

<template>
  <div v-if="cur && visible" class="relative z-[44] flex-none">
    <div class="flex h-[30px] items-center gap-1.5 overflow-hidden border-b border-(--ln2) bg-(--head) px-2.5">
      <span class="label-caps mr-0.5 whitespace-nowrap">Dev servers</span>
      <div class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <div
          v-for="v in list"
          :key="v.id"
          :title="v.cmd"
          class="box-border flex h-5 max-w-[280px] flex-none cursor-pointer items-center gap-1.5 rounded border border-(--ln) py-0 pr-[3px] pl-[7px] hover:border-(--bb)"
          :style="{ background: ui.logsOpen && v.id === tabId ? 'var(--sel)' : 'transparent' }"
          @click="ui.toggleLogs(v.id)"
        >
          <span class="size-1.5 flex-none rounded-full" :style="{ background: V.died[v.id] ? 'var(--red)' : SVC[V.status(v.id)] }" />
          <span class="chip-repo">{{ v.repo.label }}</span>
          <span v-if="ui.wide" class="mono ellipsis text-[10.5px] text-(--tx3)">{{ v.cmd }}</span>
          <span
            v-if="V.status(v.id) === 'running' && v.port"
            title="Open in browser"
            class="mono flex-none whitespace-nowrap text-[10.5px] text-(--lnk) hover:underline"
            @click.stop="openUrl(V.portOf(v))"
          >:{{ V.portOf(v) }}<UIcon name="i-hugeicons-arrow-up-right-01" class="size-3" /></span>
          <span
            :title="V.status(v.id) === 'stopped' ? 'Start' : 'Stop'"
            class="grid size-4 flex-none place-items-center rounded-sm text-[8px] text-(--tx3) hover:bg-(--hov) hover:text-(--tx)"
            @click.stop="toggle(v)"
          ><UIcon :name="V.status(v.id) === 'stopped' ? 'i-hugeicons-play' : 'i-hugeicons-stop'" class="size-3" /></span>
        </div>
      </div>
      <span class="flex-none cursor-pointer whitespace-nowrap text-[11px] text-(--tx3) hover:text-(--tx)" @click="allAction">{{ anyRun ? 'Stop all' : 'Dismiss' }}</span>
      <span class="flex-none cursor-pointer whitespace-nowrap text-[11px] text-(--tx3) hover:text-(--tx)" @click="ui.openModal('edit')">Manage</span>
      <span
        title="Show or hide the logs"
        class="box-border flex h-5 flex-none cursor-pointer items-center whitespace-nowrap rounded border border-(--bb) px-2 text-[11px] text-(--tx2) hover:text-(--tx)"
        :style="{ background: ui.logsOpen ? 'var(--segon)' : 'transparent' }"
        @click="ui.toggleLogs()"
      >Logs<UIcon :name="ui.logsOpen ? 'i-hugeicons-arrow-down-01' : 'i-hugeicons-arrow-up-01'" class="size-3" /></span>
    </div>
  </div>
</template>
