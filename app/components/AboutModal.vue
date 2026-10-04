<script setup lang="ts">
import type { AppInfo } from '#shared/types'

const ui = useUiStore()
const info = ref<AppInfo | null>(null)

const open = computed({
  get: () => ui.about,
  set: (v: boolean) => { ui.about = v },
})

watch(open, (v) => {
  if (v) api.sys.info().then((i) => { info.value = i }).catch(() => {})
}, { immediate: true })

const rows = computed(() => {
  const i = info.value
  return [
    ['Electron', i?.electron],
    ['Chromium', i?.chromium],
    ['Node.js', i?.node],
    ['Claude Code', i?.claudeVersion],
    ['Claude path', i?.claudePath],
    ['Windows', i?.windows],
  ].map(([key, v]) => ({ k: key!, v: v || '-' }))
})

function copy() {
  const i = info.value
  if (!i) return
  const body = `Canopy ${i.version} · Electron ${i.electron} · Claude Code ${i.claudeVersion}`
  navigator.clipboard.writeText(body).catch(() => {})
  ui.toast({ title: 'Version info copied', body, hue: 250, ini: 'i' })
}
</script>

<template>
  <UModal
    v-model:open="open"
    scrollable
    :close="false"
    :ui="{
      overlay: 'bg-(--ovl) place-items-[start_center] p-[64px_16px] sm:p-[64px_16px]',
      content: 'w-full max-w-[420px] items-center gap-4 px-6 pt-7 pb-5 bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0 text-(--tx)',
    }"
  >
    <template #content>
      <BrandMark :size="44" />
      <div class="flex flex-col items-center gap-1">
        <span class="font-brand text-[17px] font-semibold tracking-[-0.02em]">Canopy</span>
        <span class="text-[12.5px] text-(--tx3)">Version {{ info?.version || '-' }} · Beta channel</span>
      </div>
      <div class="grid w-full grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border border-(--ln) bg-(--chrome) px-3.5 py-3 text-[12px]">
        <template v-for="r in rows" :key="r.k">
          <span class="text-(--mu)">{{ r.k }}</span>
          <span class="mono ellipsis text-[11.5px] text-(--tx2)" :title="r.v">{{ r.v }}</span>
        </template>
      </div>
      <div class="flex w-full gap-2">
        <UButton size="md" color="neutral" variant="outline" class="flex-1 justify-center" label="Copy version info" @click="copy" />
        <UButton size="md" color="primary" class="flex-1 justify-center" label="Check for updates" @click="ui.checkUpdates()" />
      </div>
      <span class="cursor-pointer text-[12px] text-(--mu) hover:text-(--tx)" @click="open = false">Close</span>
    </template>
  </UModal>
</template>
