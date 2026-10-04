<script setup lang="ts">
// One settings row: label and optional sub text on the left, the control on the right.
defineProps<{ label: string; sub?: string; wrap?: boolean }>()
</script>

<template>
  <div class="flex items-center gap-4 border-b border-(--ln2) py-3" :class="wrap && 'flex-wrap'">
    <div class="flex flex-1 flex-col gap-[3px]" :class="wrap ? 'min-w-[200px]' : 'min-w-0'">
      <span class="text-[12.5px] text-(--tx)">{{ label }}</span>
      <span v-if="sub" class="text-[11.5px] leading-[1.45] text-(--mu)">{{ sub }}</span>
    </div>
    <slot />
  </div>
</template>
