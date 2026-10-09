<script setup lang="ts">
// The question before a change, aws-tui's way: Enter (or y) confirms a plain one; a risky one (an
// instance's power, a production deploy or parameter, a full cache flush) needs the name typed out.
import { useEventListener } from '@vueuse/core'

const A = useAwsStore()
const typed = ref('')
const input = ref<HTMLInputElement | null>(null)
const a = computed(() => A.ask!)
const okToGo = computed(() => !a.value.typed || typed.value.trim() === a.value.typed)
const mismatch = ref(false)

function close() {
  A.ask = null
  focusAwsWindow()
}

function ok() {
  if (!okToGo.value) {
    mismatch.value = true
    return
  }
  const run = a.value.run
  A.ask = null
  focusAwsWindow()
  run()
}

useAwsKeys(() => ({ modal: true, keys: { awsBack: { run: close }, awsOpen: { run: ok, hint: 'confirm' } } }))

// y confirms and n cancels a plain question, as in aws-tui.
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (a.value.typed || (e.target as HTMLElement).closest('input')) return
  if (e.key === 'y') {
    e.preventDefault()
    ok()
  } else if (e.key === 'n') {
    e.preventDefault()
    close()
  }
})

onMounted(() => nextTick(() => input.value?.focus()))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    ok()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-start justify-center bg-black/40 pt-[14vh]" @mousedown.self="close">
    <div class="flex w-[460px] max-w-[92%] flex-col gap-3 rounded-xl border border-(--bb) bg-(--modal) px-5 pb-4 pt-5 shadow-(--shadow)">
      <div class="flex flex-col gap-1">
        <span class="text-[14px] font-semibold">{{ a.title }}</span>
        <span class="whitespace-pre-line text-[12.5px] leading-[1.5] text-(--tx3)">{{ a.body }}</span>
      </div>
      <ul v-if="a.lines?.length" class="mono max-h-[200px] overflow-auto rounded-md border border-(--ln) bg-(--inp) px-3 py-2 text-[12px]">
        <li v-for="l in a.lines" :key="l" class="select-text">• {{ l }}</li>
      </ul>
      <div v-if="a.typed" class="flex flex-col gap-1.5">
        <span class="text-[12px] text-(--mu)">Type <span class="mono select-text font-semibold text-(--tx)">{{ a.typed }}</span> to confirm</span>
        <input
          ref="input"
          v-model="typed"
          class="mono h-[30px] rounded-md border bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none"
          :class="mismatch && !okToGo ? 'border-(--red)' : 'border-(--ln) focus:border-(--lnk)'"
          @keydown="onKey"
          @input="mismatch = false"
        >
        <span v-if="mismatch && !okToGo" class="text-[11.5px] text-(--red)">That doesn't match. Try again, or Esc to cancel.</span>
      </div>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" class="h-[28px] px-3 text-[12px]" label="Cancel" @click="close" />
        <UButton
          color="error"
          variant="solid"
          class="h-[28px] rounded-md bg-(--red) px-3 text-[12px] font-semibold text-white hover:bg-(--red) hover:opacity-90 disabled:opacity-50"
          :label="a.ok"
          :disabled="!okToGo"
          @click="ok"
        />
      </div>
    </div>
  </div>
</template>
