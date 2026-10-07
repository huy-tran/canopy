<script setup lang="ts">
import type { Prefs } from '#shared/types'

const prefs = usePrefsStore()

const SIZES = [11, 12, 13, 14].map(n => ({ label: String(n), value: n }))
const LINE_HEIGHTS = [
  { label: 'Compact', value: 1 },
  { label: 'Normal', value: 1.15 },
  { label: 'Relaxed', value: 1.3 },
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
const shell = computed({
  get: () => prefs.prefs.shell,
  set: (v: Prefs['shell']) => prefs.set({ shell: v }),
})

const colors = computed({
  get: () => prefs.prefs.termTheme ?? 'dark',
  set: (v: Prefs['termTheme']) => prefs.set({ termTheme: v }),
})
const size = computed({
  get: () => prefs.prefs.termSize,
  set: (v: number) => prefs.set({ termSize: v }),
})
const lineHeight = computed({
  get: () => prefs.prefs.termLineHeight,
  set: (v: number) => prefs.set({ termLineHeight: v }),
})
const cursor = computed({
  get: () => prefs.prefs.cursor,
  set: (v: Prefs['cursor']) => prefs.set({ cursor: v }),
})

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
    <SettingsRow label="Cursor" wrap>
      <Seg v-model="cursor" :items="CURSORS" size="lg" />
    </SettingsRow>
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
  </div>
</template>
