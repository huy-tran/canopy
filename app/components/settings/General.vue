<script setup lang="ts">
import type { Editor } from '#shared/types'
import { zoneCity } from '~/composables/useWeather'

const prefs = usePrefsStore()

const EDITORS: { label: string; value: Editor }[] = ['VS Code', 'Cursor', 'PhpStorm', 'Zed'].map(e => ({ label: e, value: e as Editor }))

const editor = computed({
  get: () => prefs.prefs.editor,
  set: (v: Editor) => prefs.set({ editor: v }),
})
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-1 text-[15px] font-semibold">General</div>
    <SettingsRow label="Default editor" sub="Used for new projects. Each project can change it." wrap>
      <Seg v-model="editor" :items="EDITORS" size="lg" />
    </SettingsRow>
    <SettingsRow label="Default startup command" sub="Prefilled for each new repo." wrap>
      <UInput
        :model-value="prefs.prefs.startCmd"
        placeholder="claude"
        variant="none"
        :ui="{
          root: 'w-[220px]',
          base: 'mono h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12px] text-(--tx)',
        }"
        @update:model-value="v => prefs.set({ startCmd: String(v) })"
      />
    </SettingsRow>
    <SettingsRow label="Weather location" sub="For the weather in the 3D World. Leave empty to use the city in your time zone." wrap>
      <UInput
        :model-value="prefs.prefs.weatherCity || ''"
        :placeholder="zoneCity || 'City'"
        variant="none"
        :ui="{
          root: 'w-[220px]',
          base: 'h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12px] text-(--tx)',
        }"
        @change="(e: Event) => prefs.set({ weatherCity: (e.target as HTMLInputElement).value.trim() })"
      />
    </SettingsRow>
    <SettingsToggle label="Start Canopy when Windows starts" k="launchLogin" />
    <SettingsToggle label="Keep running in the system tray" sub="Closing the window hides it. Notifications keep arriving." k="tray" />
    <SettingsToggle label="Resume sessions when the app starts" sub="Each repo reopens with claude --continue." k="resume" />
    <SettingsToggle label="Install updates automatically" sub="Downloads in the background and installs on the next restart." k="autoUpdate" />
  </div>
</template>
