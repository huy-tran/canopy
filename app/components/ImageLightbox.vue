<script setup lang="ts">
import { useEventListener } from '@vueuse/core'

// Full-window viewer for a session's pasted images. ← → browse, Esc closes.
const ui = useUiStore()
const S = useSessionsStore()

const sess = computed(() => (ui.lightbox ? S.byId(ui.lightbox.sid) : null))
const imgs = computed(() => sess.value?.images || [])
const img = computed(() => (ui.lightbox ? imgs.value[ui.lightbox.idx] || null : null))

const open = computed({
  get: () => !!img.value,
  set: (v: boolean) => {
    if (v) return
    ui.lightbox = null
    ui.focusLater()
  },
})

const meta = computed(() => {
  const i = img.value
  if (!i) return ''
  return `${i.name} · ${i.pending ? 'attached to the prompt you are typing' : 'sent with prompt ' + i.prompt}`
})

function step(d: number) {
  const lb = ui.lightbox, n = imgs.value.length
  if (!lb || !n) return
  ui.lightbox = { ...lb, idx: (lb.idx + d + n) % n }
}

function pick(j: number) {
  if (ui.lightbox) ui.lightbox = { ...ui.lightbox, idx: j }
}

useEventListener('keydown', (e: KeyboardEvent) => {
  if (!open.value) return
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    e.stopPropagation()
    step(e.key === 'ArrowLeft' ? -1 : 1)
  }
})

async function copy() {
  const i = img.value
  if (!i) return
  await api.sys.copyImage(i.path)
  ui.toast({ title: 'Image copied to clipboard', body: i.name, hue: 250 })
}

async function save() {
  const i = img.value
  if (!i) return
  const res = await api.sys.saveImageAs(i.path)
  if (res) ui.toast({ title: 'Saved', body: res, hue: 250 })
}

const navBtn = 'grid size-8 flex-none cursor-pointer place-items-center rounded-full bg-[#1A1B1F] text-[15px] text-[#C7CAD1] hover:bg-[#2A2C31]'
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :close="false"
    :ui="{
      overlay: 'bg-transparent',
      content: 'p-0 bg-[rgba(6,7,8,0.94)] border-0 rounded-none shadow-none ring-0 divide-y-0 text-[#E4E5E8]',
    }"
  >
    <template #content>
      <div v-if="img" class="flex size-full flex-col gap-3 px-5 py-4" @click="open = false">
        <div class="flex flex-wrap items-center gap-3.5 text-[12px]" @click.stop>
          <span class="font-semibold">Image #{{ img.n }}</span>
          <span class="mono text-[11px] text-[#8B8F98]">{{ meta }}</span>
          <div class="flex-1" />
          <span class="cursor-pointer text-[#A3A7B0] hover:text-white" @click="copy">Copy</span>
          <span class="cursor-pointer text-[#A3A7B0] hover:text-white" @click="save">Save as…</span>
          <span class="grid size-6 cursor-pointer place-items-center rounded-sm text-[#A3A7B0] hover:bg-[#222429] hover:text-white" @click="open = false"><UIcon name="i-hugeicons-cancel-01" class="size-3.5" /></span>
        </div>

        <div class="flex min-h-0 flex-1 items-center gap-3">
          <span v-if="imgs.length > 1" :class="navBtn" @click.stop="step(-1)">‹</span>
          <div
            class="mono grid h-full min-w-0 flex-1 place-items-center overflow-hidden rounded-lg border border-[#2A2C31] text-[12px] text-[#8B8F98]"
            style="background: repeating-linear-gradient(135deg, #1C1E22 0 8px, #17191C 8px 16px)"
            @click.stop
          >
            <div v-if="img.src" class="size-full bg-contain bg-center bg-no-repeat" :style="{ backgroundImage: `url(${img.src})` }" />
            <span v-else>screenshot · {{ img.name.replace(/\.png$/, '').replace(/-/g, ' ') }}</span>
          </div>
          <span v-if="imgs.length > 1" :class="navBtn" @click.stop="step(1)">›</span>
        </div>

        <div class="flex items-center justify-center gap-1.5">
          <div
            v-for="(x, j) in imgs"
            :key="x.n"
            class="h-[34px] w-14 cursor-pointer overflow-hidden rounded-sm border"
            :style="{
              borderColor: j === ui.lightbox?.idx ? '#E4E5E8' : '#2A2C31',
              opacity: j === ui.lightbox?.idx ? 1 : 0.55,
              background: 'repeating-linear-gradient(135deg, #1C1E22 0 4px, #17191C 4px 8px)',
            }"
            @click.stop="pick(j)"
          >
            <div v-if="x.src" class="size-full bg-cover bg-center" :style="{ backgroundImage: `url(${x.src})` }" />
          </div>
        </div>
        <div class="text-center text-[11px] text-[#6E727B]">← → browse · Esc close</div>
      </div>
    </template>
  </UModal>
</template>
