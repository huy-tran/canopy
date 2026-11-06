<script setup lang="ts">
// Minimise, maximise and close for a tool window, in the corner of its header. Close hides the window.
const maximized = ref(false)
let off: (() => void) | undefined

onMounted(() => {
  api.win.isMaximized().then((v) => { maximized.value = !!v })
  off = api.win.onMaximized(v => (maximized.value = v))
})
onBeforeUnmount(() => off?.())
</script>

<template>
  <div class="no-drag flex flex-none self-stretch text-(--tx3)">
    <div class="grid w-10 place-items-center hover:bg-(--hov)" title="Put this window back over the main window, where it started" @click="api.tool.reset(toolKind!)">
      <UIcon name="i-hugeicons-arrow-shrink" class="size-3.5" />
    </div>
    <div class="grid w-10 place-items-center hover:bg-(--hov)" title="Minimise" @click="api.win.minimize()">
      <UIcon name="i-hugeicons-minus-sign" class="size-3.5" />
    </div>
    <div class="grid w-10 place-items-center hover:bg-(--hov)" :title="maximized ? 'Restore' : 'Maximise'" @click="api.win.toggleMaximize()">
      <UIcon :name="maximized ? 'i-hugeicons-copy-02' : 'i-hugeicons-square'" class="size-3" />
    </div>
    <div class="grid w-10 place-items-center hover:bg-[#C42B1C] hover:text-white" title="Close" @click="api.win.close()">
      <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
    </div>
  </div>
</template>
