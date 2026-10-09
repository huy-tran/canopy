<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { SettingsTab } from '~/stores/ui'

const uiStore = useUiStore()

/** Last open tab, kept while the modal animates out. */
const tab = ref<SettingsTab>('general')
watch(() => uiStore.settings, (t) => { if (t) tab.value = t }, { immediate: true })

function close() {
  uiStore.settings = null
  uiStore.focusLater()
}

const open = computed({
  get: () => uiStore.settings != null,
  set: (v: boolean) => { if (!v) close() },
})

const TABS: [SettingsTab, string][] = [
  ['general', 'General'],
  ['appearance', 'Appearance'],
  ['terminal', 'Terminal'],
  ['notifications', 'Notifications'],
  ['aws', 'AWS'],
  ['keys', 'Keyboard shortcuts'],
]

const nav = computed<NavigationMenuItem[]>(() => TABS.map(([id, label]) => ({
  label,
  active: tab.value === id,
  class: tab.value === id ? 'bg-(--sel) text-(--tx)' : 'text-(--tx3)',
  onSelect: () => { uiStore.settings = id },
})))
</script>

<template>
  <UModal
    v-model:open="open"
    title="Settings"
    description="Changes save automatically"
    :ui="{
      content: 'top-[36px] translate-y-0 w-[calc(100vw-32px)] max-w-[860px] h-[calc(100dvh-72px)] max-h-[620px] sm:max-h-[620px] overflow-hidden flex flex-col',
    }"
  >
    <template #content>
      <div class="flex items-center gap-2.5 border-b border-(--ln) py-3 pr-3 pl-[18px]">
        <span class="text-[14px] font-semibold text-(--tx)">Settings</span>
        <span class="text-[11.5px] text-(--fa)">Changes save automatically</span>
        <div class="flex-1" />
        <UButton
          color="neutral"
          variant="ghost"
          aria-label="Close"
          class="grid size-6 place-items-center rounded-sm p-0 text-(--fa) hover:text-(--tx)"
          @click="close"
        >
          <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
        </UButton>
      </div>
      <div class="flex min-h-0 flex-1">
        <UNavigationMenu
          :items="nav"
          orientation="vertical"
          :ui="{
            root: 'w-[180px] flex-none gap-0 border-r border-(--ln) bg-(--chrome) px-2 py-2.5',
            list: 'flex flex-col gap-[2px]',
            link: 'h-[30px] px-[10px] py-0 rounded-md text-[12.5px] font-normal whitespace-nowrap cursor-pointer before:hidden hover:bg-(--hov)',
          }"
        />
        <div class="min-w-0 flex-1 overflow-auto px-[22px] pt-4 pb-[22px] text-(--tx)">
          <SettingsGeneral v-if="tab === 'general'" />
          <SettingsAppearance v-else-if="tab === 'appearance'" />
          <SettingsTerminal v-else-if="tab === 'terminal'" />
          <SettingsNotifications v-else-if="tab === 'notifications'" />
          <SettingsAws v-else-if="tab === 'aws'" />
          <SettingsKeys v-else />
        </div>
      </div>
    </template>
  </UModal>
</template>
