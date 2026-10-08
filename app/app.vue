<script setup lang="ts">
const ui = useUiStore()

useAppShortcuts()
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
    <FileExplorerModal />
    <SettingsModal />
    <AboutModal />
    <ConfirmModal />
    <DailySummaryModal />
    <UpdateModal />
    <ImageLightbox />
    <ImageHoverPreview />
  </UApp>
</template>
