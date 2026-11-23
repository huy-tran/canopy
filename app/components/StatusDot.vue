<script setup lang="ts">
// A session's status: a spinning ring while Claude works, a dot in the status colour otherwise.
withDefaults(defineProps<{ status: string; size?: number }>(), { size: 7 })
</script>

<template>
  <span
    class="status-dot"
    :class="{ working: status === 'working' }"
    :style="{ '--c': SC[status] || SC.idle, '--d': `${size}px` }"
  />
</template>

<style scoped>
/* The box is the ring's size for every status, so a row doesn't shift when the status changes. */
.status-dot { position: relative; flex: none; width: calc(var(--d) + 4px); height: calc(var(--d) + 4px); }
.status-dot::before { content: ''; position: absolute; inset: 2px; border-radius: 50%; background: var(--c); }
.status-dot.working::before { inset: 0; background: none; border: 1.5px solid var(--c); border-top-color: transparent; animation: status-spin .8s linear infinite; }
@keyframes status-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .status-dot.working::before { animation: none; }
}
</style>
