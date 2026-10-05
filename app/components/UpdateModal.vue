<script setup lang="ts">
// Updates via electron-updater: checking, available, downloading, ready, up to date, error.
const ui = useUiStore()
const version = ref('')

const open = computed({
  get: () => ui.updOpen,
  set: (v: boolean) => { ui.updOpen = v },
})

watch(open, (v) => {
  if (v && !version.value) api.sys.info().then((i) => { version.value = i.version }).catch(() => {})
}, { immediate: true })

// The spinner glyph cycles every 300ms while checking.
const tick = ref(0)
let spinT: ReturnType<typeof setInterval> | undefined
watch(() => open.value && ui.upd?.status === 'checking', (on) => {
  clearInterval(spinT)
  if (on) spinT = setInterval(() => { tick.value++ }, 300)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(spinT))

function close() {
  ui.updOpen = false
}

interface UpdView {
  title: string
  sub: string
  notes: string[]
  showBar?: boolean
  pct?: number
  pctLabel?: string
  primary?: { label: string; run: () => void }
  secondary?: { label: string; run: () => void }
}

const v = computed<UpdView>(() => {
  const u = ui.upd
  const cur = version.value || '-'
  const later = { label: 'Later', run: close }
  if (!u || u.status === 'checking') {
    const g = ['◐', '◓', '◑', '◒'][tick.value % 4]
    return { title: g + '  Checking for updates…', sub: 'You have ' + cur + '.', notes: [], secondary: { label: 'Cancel', run: close } }
  }
  const notes = u.notes || []
  if (u.status === 'available') return { title: `Canopy ${u.version} is available`, sub: 'You have ' + cur + '.', notes, primary: { label: 'Download update', run: () => api.upd.download() }, secondary: later }
  if (u.status === 'downloading') {
    const pct = Math.round(u.pct || 0)
    const mb = u.total ? ` of ${(u.total / 1048576).toFixed(1)} MB` : ''
    return { title: `Downloading ${u.version || ''}…`.replace(' …', '…'), sub: 'You can keep working. Sessions stay open.', notes: [], showBar: true, pct, pctLabel: `${pct}%${mb}`, secondary: { label: 'Hide', run: close } }
  }
  if (u.status === 'ready') return { title: 'Update ready', sub: 'Restart to finish. Running sessions resume with claude --continue.', notes, primary: { label: 'Restart now', run: () => api.upd.install() }, secondary: later }
  if (u.status === 'error') return { title: 'Couldn’t check for updates', sub: u.error || 'Something went wrong.', notes: [], primary: { label: 'OK', run: close } }
  return { title: 'You’re up to date', sub: `Canopy ${cur} is the latest version.`, notes: [], primary: { label: 'OK', run: close } }
})
</script>

<template>
  <UModal
    v-model:open="open"
    scrollable
    :close="false"
    :ui="{
      overlay: 'bg-(--ovl) place-items-[start_center] p-[64px_16px] sm:p-[64px_16px]',
      content: 'w-full max-w-[440px] gap-4 px-[22px] py-5 bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0 text-(--tx)',
    }"
  >
    <template #content>
      <div class="flex items-center gap-3">
        <BrandMark :size="32" />
        <div class="flex min-w-0 flex-col gap-[3px]">
          <span class="text-[14px] font-semibold whitespace-pre">{{ v.title }}</span>
          <span class="text-[12px] leading-[1.45] text-(--tx3)">{{ v.sub }}</span>
        </div>
      </div>

      <div v-if="v.notes.length" class="flex flex-col gap-[7px] rounded-lg border border-(--ln) bg-(--chrome) px-3.5 py-3">
        <span class="label-caps">New in {{ ui.upd?.version }}</span>
        <div v-for="(n, i) in v.notes" :key="i" class="flex gap-2 text-[12.5px] leading-[1.45] text-(--tx2)">
          <span class="text-(--fa)">•</span><span>{{ n }}</span>
        </div>
      </div>

      <div v-if="v.showBar" class="flex flex-col gap-1.5">
        <UProgress
          :model-value="v.pct"
          :max="100"
          :ui="{ root: 'gap-0', base: 'h-1.5 rounded-sm bg-(--trk)', indicator: 'rounded-none bg-(--blue)' }"
        />
        <span class="mono text-[11px] text-(--fa)">{{ v.pctLabel }}</span>
      </div>

      <div class="flex justify-end gap-2">
        <UButton v-if="v.secondary" size="md" color="neutral" variant="outline" :label="v.secondary.label" @click="v.secondary.run()" />
        <UButton v-if="v.primary" size="md" color="primary" :label="v.primary.label" @click="v.primary.run()" />
      </div>
    </template>
  </UModal>
</template>
