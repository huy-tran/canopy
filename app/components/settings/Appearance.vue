<script setup lang="ts">
import type { ThemePref, WaitStyle, WindowBlur } from '#shared/types'

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

const BLURS: { label: string; value: WindowBlur }[] = [
  { label: 'Acrylic', value: 'acrylic' },
  { label: 'Mica', value: 'mica' },
]

const opacity = computed({
  get: () => prefs.prefs.opacity ?? 100,
  set: (v: number) => prefs.set({ opacity: v }),
})
const blur = computed({
  get: () => prefs.prefs.blur || 'acrylic',
  set: (v: WindowBlur) => prefs.set({ blur: v }),
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
    <SettingsRow label="Window opacity" sub="Below 100% you can see your desktop through the window, like in Tabby. Needs Windows 11." wrap>
      <div class="flex w-[280px] max-w-full flex-none items-center gap-3">
        <USlider v-model="opacity" :min="50" :max="100" :step="5" size="sm" class="flex-1" />
        <span class="mono w-9 text-right text-[11.5px] text-(--tx2)">{{ opacity }}%</span>
      </div>
    </SettingsRow>
    <SettingsRow label="Background effect" sub="Acrylic blurs what is behind the window. Mica tints it with your wallpaper." wrap>
      <Seg v-model="blur" :items="BLURS" size="lg" :class="opacity === 100 ? 'pointer-events-none opacity-50' : ''" />
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
