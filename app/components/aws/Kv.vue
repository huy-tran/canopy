<script setup lang="ts">
// A details pane: names on the left, values on the right, as aws-tui's key-value boxes.
defineProps<{ rows: { k: string; v: string | number | null | undefined; color?: string; mono?: boolean }[] }>()
</script>

<template>
  <div class="grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1 text-[12.5px]">
    <template v-for="r in rows" :key="r.k">
      <span class="text-(--mu)">{{ r.k }}</span>
      <span class="min-w-0 select-text break-words" :class="r.mono && 'mono text-[12px]'" :style="r.color ? { color: r.color } : undefined">{{ r.v === '' || r.v === null || r.v === undefined ? '-' : r.v }}</span>
    </template>
  </div>
</template>
