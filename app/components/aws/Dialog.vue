<script setup lang="ts">
// A dialog over the AWS window's screens: the pickers, the finder, bookmarks, a confirmation.
// Esc closes it (its own awsBack); a click outside does too.
defineProps<{ title: string; width?: string; sub?: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="absolute inset-0 z-20 flex items-start justify-center bg-black/35 pt-[8vh]" @mousedown.self="emit('close')">
    <div class="flex max-h-[76vh] min-h-0 flex-col overflow-hidden rounded-xl border border-(--bb) bg-(--modal) shadow-(--shadow)" :style="{ width: width || '640px', maxWidth: '92%' }">
      <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) pl-4 pr-2">
        <span class="text-[13px] font-semibold">{{ title }}</span>
        <span v-if="sub" class="ellipsis text-[12px] text-(--mu)">{{ sub }}</span>
        <div class="flex-1" />
        <span class="mono text-[10.5px] text-(--fa)">Esc</span>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Close" @click="emit('close')" />
      </div>
      <slot />
    </div>
  </div>
</template>
