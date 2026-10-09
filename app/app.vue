<script setup lang="ts">
const ui = useUiStore()

useAppShortcuts()

// The heaviest windows load their code the first time they open, then stay mounted so they can animate shut.
const opened = reactive({ gh: false, explorer: false, summary: false })
watchEffect(() => {
  if (ui.gh) opened.gh = true
  if (ui.explorer) opened.explorer = true
  if (ui.summary) opened.summary = true
})
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right', duration: 3500 }" :tooltip="{ delayDuration: 400 }">
    <div class="relative flex h-screen min-h-[520px] select-none flex-col overflow-hidden bg-(--win) text-(--tx)" style="font-size: 12px">
      <AppTitleBar />
      <UDashboardGroup unit="px" :persistent="false" class="relative inset-auto min-h-0 flex-1">
        <UDashboardSidebar
          :default-size="264"
          :min-size="264"
          :max-size="264"
          :toggle="false"
          :ui="{
            root: 'flex min-h-0 min-w-0 border-e border-(--ln) bg-(--chrome)',
            body: 'p-0 gap-0 overflow-hidden',
          }"
        >
          <AppSidebar />
        </UDashboardSidebar>
        <UDashboardPanel id="main" :ui="{ root: 'min-h-0 flex-1', body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-hidden' }">
          <template #body>
            <MainArea />
          </template>
        </UDashboardPanel>
      </UDashboardGroup>
      <AppStatusBar />
    </div>

    <CommandPalette />
    <ProjectModal />
    <SessionDetailsModal />
    <LazyGitHubWindow v-if="opened.gh" />
    <LazyFileExplorerModal v-if="opened.explorer" />
    <SettingsModal />
    <AboutModal />
    <ConfirmModal />
    <LazyDailySummaryModal v-if="opened.summary" />
    <UpdateModal />
    <ImageLightbox />
    <ImageHoverPreview />
  </UApp>
</template>
