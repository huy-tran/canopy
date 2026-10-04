<script setup lang="ts">
import type { Project } from '#shared/types'

const props = defineProps<{ project: Project }>()

const ui = useUiStore()
const S = useSessionsStore()
const P = useProjectsStore()

const ss = computed(() => S.ofProject(props.project.id))
</script>

<template>
  <div class="flex h-[34px] flex-none items-end gap-0.5 overflow-hidden border-b border-(--ln2) bg-(--head) px-1.5">
    <div
      v-for="s in ss"
      :key="s.id"
      class="box-border flex h-[30px] min-w-[90px] flex-[0_1_250px] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 pl-2.5 pr-2"
      :style="{
        background: s.id === ui.fid ? 'var(--term)' : s.status === 'waiting' ? 'var(--ambs)' : 'transparent',
        borderColor: s.id === ui.fid ? 'var(--ln)' : 'transparent',
        boxShadow: s.id === ui.fid ? `inset 0 2px 0 ${pcol(project.hue)}` : 'none',
      }"
      @click="ui.focusSession(s.id)"
    >
      <UIcon v-if="s.kind === 'shell'" name="i-hugeicons-command-line" class="size-3.5 flex-none text-(--mu)" />
      <span v-else class="h-[7px] w-[7px] flex-none rounded-full" :style="{ background: SC[s.status] }" />
      <span class="mono flex-none rounded-sm bg-(--chip) px-[5px] text-[10.5px] text-(--tx2)">{{ P.repoOf(s.pid, s.repoId).label }}</span>
      <span class="ellipsis flex-1 text-[12px]" :style="{ color: s.id === ui.fid ? 'var(--tx)' : 'var(--tx3)' }">{{ s.title }}</span>
      <UTooltip text="Close session">
        <span
          class="grid h-4 w-4 flex-none place-items-center rounded-sm text-[10px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
          @click.stop="ui.closeSession(s.id)"
        ><UIcon name="i-hugeicons-cancel-01" class="size-2.5" /></span>
      </UTooltip>
    </div>
    <UTooltip text="New session">
      <div class="grid h-[30px] w-[30px] flex-none cursor-pointer place-items-center text-(--mu) hover:text-(--tx)" @click.stop="ui.newMenu = !ui.newMenu"><UIcon name="i-hugeicons-add-01" class="size-3.5" /></div>
    </UTooltip>
  </div>
</template>
