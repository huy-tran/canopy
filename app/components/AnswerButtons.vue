<script setup lang="ts">
// Buttons for the choices a waiting session shows (Yes / Always / No), read from its screen.
const props = withDefaults(defineProps<{ sid: string; compact?: boolean }>(), { compact: false })

const ui = useUiStore()
const S = useSessionsStore()

const s = computed(() => S.byId(props.sid))
// Re-read every tick: the prompt is drawn a moment after the session starts waiting.
const options = computed(() => {
  void ui.now
  return s.value?.status === 'waiting' && !s.value.exited ? promptOptions(props.sid) : []
})

const size = computed(() => (props.compact ? 'h-5 px-1.5 text-[10.5px]' : 'h-[22px] px-2 text-[11.5px]'))
</script>

<template>
  <div v-if="options.length" class="flex flex-none items-center gap-1" @click.stop>
    <UTooltip v-for="(o, i) in options" :key="o.key" :text="`${o.key}. ${o.text}`">
      <UButton
        :color="i === 0 ? 'primary' : 'neutral'"
        :variant="i === 0 ? 'solid' : 'outline'"
        :class="[size, 'rounded-sm py-0 whitespace-nowrap']"
        @click="ui.answer(sid, o.key)"
      >
        {{ o.label }}
      </UButton>
    </UTooltip>
  </div>
</template>
