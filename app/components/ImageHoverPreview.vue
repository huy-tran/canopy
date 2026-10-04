<script setup lang="ts">
// Preview card shown while hovering an [Image #n] link in a terminal.
const ui = useUiStore()
const S = useSessionsStore()

const hov = computed(() => {
  const h = ui.hoverImg
  if (!h) return null
  const im = S.byId(h.sid)?.images.find(x => x.n === h.n)
  if (!im) return null
  return {
    x: Math.max(8, Math.min(h.x - 30, ui.width - 280)) + 'px',
    y: h.y + 16 + 'px',
    name: `Image #${im.n} · ${im.name}`,
    src: im.src,
    label: im.name.replace(/\.png$/, '').replace(/-/g, ' '),
  }
})
</script>

<template>
  <div
    v-if="hov"
    class="pointer-events-none fixed z-50 flex w-[260px] flex-col gap-1.5 rounded-lg border border-(--bb) bg-(--modal) p-1.5 shadow-(--shadow)"
    :style="{ left: hov.x, top: hov.y }"
  >
    <div class="mono grid h-[146px] place-items-center overflow-hidden rounded-sm text-[10.5px] text-(--mu)" style="background: repeating-linear-gradient(135deg, var(--thA) 0 6px, var(--thB) 6px 12px)">
      <div v-if="hov.src" class="size-full bg-contain bg-center bg-no-repeat" :style="{ backgroundImage: `url(${hov.src})` }" />
      <span v-else>screenshot · {{ hov.label }}</span>
    </div>
    <div class="flex justify-between gap-2 px-0.5 pb-0.5 text-[11px] text-(--tx3)">
      <span class="ellipsis">{{ hov.name }}</span><span class="flex-none text-(--fa)">click to open</span>
    </div>
  </div>
</template>
