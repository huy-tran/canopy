<script setup lang="ts">
import type { Prefs } from '#shared/types'
import { DEFAULT_PREFS } from '~/stores/prefs'

const prefs = usePrefsStore()

const SIZES = [10, 11, 12, 13, 14, 15, 16].map(n => ({ label: String(n), value: n }))
const LINE_HEIGHTS = [
  { label: 'Compact', value: 1 },
  { label: 'Normal', value: 1.15 },
  { label: 'Relaxed', value: 1.3 },
]
const SPACING = [
  { label: 'None', value: 0 },
  { label: '1 px', value: 1 },
  { label: '2 px', value: 2 },
]
const WEIGHTS = [
  { label: 'Light', value: 300 },
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semibold', value: 600 },
]
const BOLD_WEIGHTS = [
  { label: 'Medium', value: 500 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold', value: 700 },
]
const BRIGHTNESS: { label: string; value: Prefs['termBrightness'] }[] = [
  { label: 'Dim', value: 'dim' },
  { label: 'Normal', value: 'normal' },
  { label: 'Bright', value: 'bright' },
]
const CURSORS: { label: string; value: Prefs['cursor'] }[] = [
  { label: 'Block', value: 'Block' },
  { label: 'Bar', value: 'Bar' },
  { label: 'Underline', value: 'Underline' },
]

const COLORS: { label: string; value: Prefs['termTheme'] }[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Match app', value: 'app' },
]

const S = useSessionsStore()
const shellItems = computed(() => S.shells.map(sh => ({ label: sh.label, value: sh.kind })))

/** Two-way binding to a pref, falling back to its default for prefs saved before it existed. */
function pref<K extends keyof Prefs>(k: K) {
  return computed({
    get: () => prefs.prefs[k] ?? DEFAULT_PREFS[k],
    set: (v: Prefs[K]) => prefs.set({ [k]: v } as Partial<Prefs>),
  })
}

const shell = pref('shell')
const colors = pref('termTheme')
const size = pref('termSize')
const lineHeight = pref('termLineHeight')
const spacing = pref('termLetterSpacing')
const weight = pref('termWeight')
const boldWeight = pref('termWeightBold')
const brightness = pref('termBrightness')
const cursor = pref('cursor')

/** The terminal look settings, which Reset puts back to their defaults. */
const LOOK = ['termSize', 'termLineHeight', 'termLetterSpacing', 'termWeight', 'termWeightBold', 'termBrightness', 'termContrast', 'termBoldBright', 'cursor', 'cursorBlink'] as const
const lookChanged = computed(() => LOOK.some(k => (prefs.prefs[k] ?? DEFAULT_PREFS[k]) !== DEFAULT_PREFS[k]))
function resetLook() {
  prefs.set(Object.fromEntries(LOOK.map(k => [k, DEFAULT_PREFS[k]])) as Partial<Prefs>)
}

const scrollRef = useTemplateRef<{ inputRef: HTMLInputElement | null }>('scrollRef')
function setScrollback(v: string | number) {
  const raw = String(v)
  const clean = raw.replace(/[^0-9]/g, '')
  prefs.set({ scrollback: clean })
  // Keep the field in sync when a stripped character leaves the stored value unchanged.
  const el = scrollRef.value?.inputRef
  if (el && el.value !== clean) el.value = clean
}
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-1 text-[15px] font-semibold">Terminal</div>
    <SettingsRow label="Font" sub="Pick a bundled coding font or any installed one. Status line icons work with all of them." wrap>
      <div class="w-[280px] max-w-full flex-none">
        <SettingsFontPicker kind="term" />
      </div>
    </SettingsRow>
    <SettingsRow label="Default shell" sub="For plain terminals outside Claude: the shell panel (Ctrl `) and Shell in + Session. You can still pick another for each new shell." wrap>
      <USelect
        v-model="shell"
        :items="shellItems"
        :placeholder="shellItems.length ? 'Choose a shell' : 'Restart Canopy to list shells'"
        :ui="{ base: 'w-[280px] max-w-full h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx) ring-0', content: 'bg-(--modal) ring-0 border border-(--bb) rounded-lg', item: 'text-[12.5px]' }"
      />
    </SettingsRow>
    <SettingsRow label="Colors" sub="Claude Code draws for its own theme, dark by default. Use Match app only after switching Claude to /theme light." wrap>
      <Seg v-model="colors" :items="COLORS" size="lg" />
    </SettingsRow>
    <SettingsRow label="Font size" wrap>
      <Seg v-model="size" :items="SIZES" size="lg" />
    </SettingsRow>
    <SettingsRow label="Line height" sub="Space between lines. Compact matches most other terminals." wrap>
      <Seg v-model="lineHeight" :items="LINE_HEIGHTS" size="lg" />
    </SettingsRow>
    <SettingsRow label="Letter spacing" sub="Extra space between characters." wrap>
      <Seg v-model="spacing" :items="SPACING" size="lg" />
    </SettingsRow>
    <SettingsRow label="Font weight" sub="Fonts without this weight use the closest one they have." wrap>
      <Seg v-model="weight" :items="WEIGHTS" size="lg" />
    </SettingsRow>
    <SettingsRow label="Bold text weight" wrap>
      <Seg v-model="boldWeight" :items="BOLD_WEIGHTS" size="lg" />
    </SettingsRow>
    <SettingsRow label="Text brightness" sub="Bright makes plain text whiter on dark terminals and darker on light ones." wrap>
      <Seg v-model="brightness" :items="BRIGHTNESS" size="lg" />
    </SettingsRow>
    <SettingsToggle label="Boost contrast" sub="Lightens or darkens coloured text that is hard to read on the background." k="termContrast" />
    <SettingsToggle label="Bright colours for bold text" sub="Bold text uses the brighter version of its colour." k="termBoldBright" />
    <SettingsRow label="Cursor" wrap>
      <Seg v-model="cursor" :items="CURSORS" size="lg" />
    </SettingsRow>
    <SettingsToggle label="Blinking cursor" k="cursorBlink" />
    <SettingsRow label="Scrollback" sub="Lines kept per terminal." wrap>
      <UInput
        ref="scrollRef"
        :model-value="prefs.prefs.scrollback"
        placeholder="5000"
        variant="none"
        inputmode="numeric"
        :ui="{
          root: 'w-[120px]',
          base: 'mono h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12px] text-(--tx)',
        }"
        @update:model-value="setScrollback"
      />
    </SettingsRow>
    <div v-if="lookChanged" class="pt-3 text-[12px]">
      <span class="cursor-pointer text-(--lnk) hover:underline" @click="resetLook">Reset size, spacing, weight, brightness and cursor to the defaults</span>
    </div>
  </div>
</template>
