<script setup lang="ts">
// Canopy logo: a ute canopy on the tray. The side windows take the colour behind the mark.
// `simple` drops the windows so the mark stays crisp at 16 and 24px.
withDefaults(defineProps<{ size?: number; simple?: boolean }>(), { size: 16, simple: false })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 64 64" aria-label="Canopy" role="img" class="flex-none">
    <rect width="64" height="64" rx="14" fill="#1C1A18" />
    <path d="M11 41V25c0-5 3.5-8.5 8.5-8.5h25c5 0 8.5 3.5 8.5 8.5v16z" fill="#D9773A" />
    <template v-if="!simple">
      <rect x="16.5" y="22.5" width="13.5" height="11" rx="2.5" fill="#1C1A18" />
      <rect x="34" y="22.5" width="13.5" height="11" rx="2.5" fill="#1C1A18" />
    </template>
    <rect x="7" y="43.5" width="50" height="4.5" rx="2.25" fill="#D9773A" opacity="0.55" />
  </svg>
</template>
