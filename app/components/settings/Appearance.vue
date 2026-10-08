<script setup lang="ts">
import type { ThemePref, WaitStyle } from '#shared/types'
import { SIM_GLASS_MAX, simGlassOf } from '~/stores/prefs'

const prefs = usePrefsStore()

const THEMES: { label: string; value: ThemePref }[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'System', value: 'system' },
]
const WAIT: { label: string; value: WaitStyle }[] = [
  { label: 'Highlight and count', value: 'both' },
  { label: 'Highlight only', value: 'highlight' },
  { label: 'Count only', value: 'badge' },
]

const simGlass = computed({
  get: () => simGlassOf(prefs.prefs),
  set: (v: number) => prefs.set({ simGlass: v }),
})

const theme = computed({
  get: () => prefs.theme,
  set: (v: ThemePref) => { prefs.theme = v },
})
const waitStyle = computed({
  get: () => prefs.prefs.waitStyle || 'both',
  set: (v: WaitStyle) => prefs.set({ waitStyle: v }),
})
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-1 text-[15px] font-semibold">Appearance</div>
    <SettingsRow label="Theme" sub="System follows your Windows setting." wrap>
      <Seg v-model="theme" :items="THEMES" size="lg" />
    </SettingsRow>
    <SettingsRow label="Session window in the workspace" sub="How solid a session you open in the workspace simulation is. The characters always show through a little." wrap>
      <div class="flex w-[280px] max-w-full flex-none items-center gap-3">
        <USlider v-model="simGlass" :min="30" :max="SIM_GLASS_MAX" :step="5" size="sm" class="flex-1" />
        <span class="mono w-9 text-right text-[11.5px] text-(--tx2)">{{ simGlass }}%</span>
      </div>
    </SettingsRow>
    <SettingsRow label="App font" sub="Used for everything except terminals and code." wrap>
      <div class="w-[280px] max-w-full flex-none">
        <SettingsFontPicker kind="app" />
      </div>
    </SettingsRow>
    <SettingsRow label="Projects waiting on you" sub="How a project with a waiting session stands out in the sidebar." wrap>
      <Seg v-model="waitStyle" :items="WAIT" size="lg" />
    </SettingsRow>
    <SettingsToggle label="Show today’s cost next to each project" k="showCost" />
  </div>
</template>
