<script setup lang="ts">
import type { Prefs } from '#shared/types'

type BoolKey = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

const props = defineProps<{ label: string; sub?: string; k: BoolKey }>()
const prefs = usePrefsStore()

const on = computed({
  get: () => !!prefs.prefs[props.k],
  set: (v: boolean) => prefs.set({ [props.k]: v }),
})
</script>

<template>
  <SettingsRow :label="label" :sub="sub">
    <USwitch
      v-model="on"
      :aria-label="label"
      :ui="{
        base: 'w-[30px] border-2 cursor-pointer data-[state=checked]:bg-(--grn) data-[state=unchecked]:bg-(--trk)',
        container: 'h-[18px]',
        thumb: 'size-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] data-[state=checked]:translate-x-[12px]',
      }"
    />
  </SettingsRow>
</template>
