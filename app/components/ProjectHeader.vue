<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Layout, Project } from '#shared/types'

const props = defineProps<{ project: Project }>()

const ui = useUiStore()
const S = useSessionsStore()
const prefs = usePrefsStore()

const view = computed({
  get: () => props.project.view,
  set: v => ui.setView(v),
})

const isT = computed(() => props.project.view !== 'overview')
const canBc = computed(() => isT.value && S.claudeOf(props.project.id).length >= 2)

const layouts: { id: Layout; icon: string; title: string }[] = [
  { id: 'tabs', icon: 'i-hugeicons-layout-01', title: 'Tabs · Ctrl Shift L cycles layouts' },
  { id: 'split', icon: 'i-hugeicons-layout-2-column', title: 'Split side by side' },
  { id: 'grid', icon: 'i-hugeicons-grid-view', title: 'Grid' },
]

const menuOpen = computed({
  get: () => ui.newMenu,
  set: (v: boolean) => { ui.newMenu = v },
})

const menuItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'New session in', type: 'label' as const }],
  props.project.repos.map(r => ({ label: r.label, slot: 'repo' as const, repo: r, onSelect: (e: Event) => e.preventDefault() })),
])

function busyCount(repoId: string) {
  return S.sessions.filter(s => s.repoId === repoId && !s.wt).length
}

function start(repoId: string, wt: boolean) {
  ui.newMenu = false
  ui.newSession(repoId, wt)
}

/** A plain shell as a pane in this repo: the default shell, or one picked from the arrow menu. */
function shellItems(repoId: string): DropdownMenuItem[][] {
  return [S.shells.map(sh => ({
    label: sh.label + (sh.kind === prefs.prefs.shell ? ' (default)' : ''),
    onSelect: () => ui.openShell(repoId, { kind: sh.kind, docked: false }),
  }))]
}

const defaultShell = computed(() => S.shellLabel(prefs.prefs.shell))
</script>

<template>
  <div class="flex h-10 flex-none items-center gap-2.5 border-b border-(--ln) bg-(--head) px-3">
    <span class="h-2.5 w-2.5 flex-none rounded-sm" :style="{ background: pcol(project.hue) }" />
    <span class="ellipsis text-[13px] font-semibold">{{ project.name }}</span>
    <Seg
      v-model="view"
      :items="[
        { label: 'Terminals', value: 'terminals', title: prefs.kl('toggleView') },
        { label: 'Overview', value: 'overview', title: prefs.kl('toggleView') },
      ]"
    />
    <div class="flex-1" />

    <template v-if="isT">
      <div class="flex flex-none gap-[2px] rounded-lg border border-(--ln) bg-(--seg) p-[2px]">
        <UTooltip v-for="l in layouts" :key="l.id" :text="l.title">
          <button
            class="grid h-5 w-7 cursor-pointer place-items-center rounded-sm"
            :style="{ background: project.layout === l.id ? 'var(--segon)' : 'transparent', color: project.layout === l.id ? 'var(--tx)' : 'var(--mu)' }"
            @click="ui.setLayout(l.id)"
          >
            <UIcon :name="l.icon" class="size-3.5" />
          </button>
        </UTooltip>
      </div>

      <UTooltip v-if="canBc" :text="`Send one prompt to several sessions (${prefs.kl('promptAll')})`">
        <UButton color="neutral" variant="outline" size="xs" label="Prompt all" class="flex-none" @click="ui.openBc()" />
      </UTooltip>

      <UDropdownMenu
        v-model:open="menuOpen"
        :items="menuItems"
        :content="{ align: 'end', sideOffset: 6 }"
        :ui="{ content: 'w-[400px] p-[5px]', label: 'px-2 pt-1 pb-1.5 label-caps', item: 'h-auto p-0 data-highlighted:before:bg-transparent cursor-default' }"
      >
        <UTooltip :text="`New session (${prefs.kl('newSession')})`">
          <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-add-01" :label="ui.wide ? 'Session' : undefined" class="flex-none" />
        </UTooltip>
        <template #repo="{ item }">
          <div class="flex w-full flex-col gap-1.5 rounded-md border-t border-(--ln2) p-2">
            <div class="flex items-center gap-2">
              <span class="mono rounded-sm bg-(--chip) px-[5px] py-px text-[10.5px] text-(--tx2)">{{ (item as any).repo.label }}</span>
              <span class="ellipsis mono flex-1 text-[11px] text-(--mu)">{{ (item as any).repo.path }}</span>
            </div>
            <div v-if="busyCount((item as any).repo.id)" class="text-[11px] leading-[1.4] text-(--amb)">
              {{ busyCount((item as any).repo.id) }} session{{ busyCount((item as any).repo.id) === 1 ? '' : 's' }} already in this folder. A worktree avoids edit conflicts.
            </div>
            <div class="grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <UButton
                :color="busyCount((item as any).repo.id) ? 'neutral' : 'primary'"
                :variant="busyCount((item as any).repo.id) ? 'outline' : 'solid'"
                size="xs"
                class="h-[26px] justify-center font-normal"
                label="Same folder"
                @click="start((item as any).repo.id, false)"
              />
              <UTooltip text="New git worktree on its own branch">
                <UButton
                  :color="busyCount((item as any).repo.id) ? 'primary' : 'neutral'"
                  :variant="busyCount((item as any).repo.id) ? 'solid' : 'outline'"
                  size="xs"
                  class="h-[26px] justify-center font-normal"
                  icon="i-hugeicons-git-fork"
                  label="New worktree"
                  @click="start((item as any).repo.id, true)"
                />
              </UTooltip>
              <div class="flex">
                <UTooltip :text="`Plain ${defaultShell} in this folder, outside Claude`">
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="xs"
                    class="h-[26px] justify-center rounded-r-none font-normal"
                    icon="i-hugeicons-command-line"
                    label="Shell"
                    @click="ui.openShell((item as any).repo.id, { docked: false })"
                  />
                </UTooltip>
                <UDropdownMenu :items="shellItems((item as any).repo.id)" :content="{ align: 'end', sideOffset: 4 }" :ui="{ content: 'w-[220px]' }">
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="xs"
                    class="h-[26px] w-5 justify-center rounded-l-none px-0 font-normal -ml-px"
                    icon="i-hugeicons-arrow-down-01"
                    aria-label="Choose a shell"
                  />
                </UDropdownMenu>
              </div>
            </div>
          </div>
        </template>
      </UDropdownMenu>
    </template>

    <UTooltip :text="`Files and git changes (${prefs.kl('files')})`">
      <UButton color="neutral" variant="outline" size="xs" label="Files" class="flex-none" @click="ui.openExplorer()" />
    </UTooltip>
    <UTooltip text="What Claude did today, and a recap for your timesheet">
      <UButton color="neutral" variant="outline" size="xs" label="Summary" class="flex-none" @click="ui.openSummary(project.id)" />
    </UTooltip>
    <UTooltip text="Edit project">
      <UButton color="neutral" variant="ghost" size="xs" label="Edit" class="flex-none" @click="ui.openModal('edit')" />
    </UTooltip>
  </div>
</template>
