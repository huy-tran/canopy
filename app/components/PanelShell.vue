<script setup lang="ts">
// The terminal of a shell docked in the panel.
const props = defineProps<{ sid: string }>()

const host = ref<HTMLElement | null>(null)

onMounted(() => {
  attachTerminal(props.sid, host.value!)
  nextTick(() => focusTerminal(props.sid))
})

onBeforeUnmount(() => {
  if (host.value) detachTerminal(props.sid, host.value)
})
</script>

<template>
  <div class="min-h-0 flex-1 overflow-hidden px-2.5 pt-1" @click="focusTerminal(sid)">
    <div ref="host" class="h-full w-full" />
  </div>
</template>
