<script setup lang="ts">
// Find in a terminal's scrollback: Enter for the next match, Shift Enter for the previous, Esc to close.
import type { FindState } from '~/utils/terminals'

const props = defineProps<{ sid: string }>()
const ui = useUiStore()
const prefs = usePrefsStore()

const q = ref('')
const matchCase = ref(false)
const found = ref<FindState>({ index: -1, count: 0 })
const input = ref<{ inputRef?: HTMLInputElement | null } | null>(null)

const off = onFindResults(props.sid, (f) => { found.value = f })

function go(dir: 1 | -1, typing = false) {
  findInTerminal(props.sid, q.value, dir, { caseSensitive: matchCase.value, typing })
}

function close() {
  ui.find = null
  focusTerminal(props.sid)
}

const count = computed(() => {
  if (!q.value) return ''
  const f = found.value
  if (!f.count) return 'No matches'
  return f.index < 0 ? `${f.count}+ matches` : `${f.index + 1} of ${f.count}`
})

watch([q, matchCase], () => go(1, true))

// Pressing the shortcut again while the bar is open puts the cursor back in it.
watch(() => ui.findTick, () => input.value?.inputRef?.select())

onMounted(() => nextTick(() => input.value?.inputRef?.focus()))
onBeforeUnmount(() => {
  off()
  clearFind(props.sid)
})
</script>

<template>
  <div class="absolute right-3 top-1.5 z-10 flex items-center gap-1 rounded-md border border-(--bb) bg-(--modal) py-1 pr-1 pl-2 shadow-(--shadow)" @mousedown.stop @click.stop>
    <UIcon name="i-hugeicons-search-01" class="size-3.5 flex-none text-(--fa)" />
    <UInput
      ref="input"
      v-model="q"
      variant="none"
      placeholder="Find in terminal"
      :ui="{ root: 'w-[190px]', base: 'h-6 rounded-none p-0 text-[12.5px] text-(--tx) placeholder:text-(--fa)' }"
      @keydown.enter.prevent.stop="go($event.shiftKey ? -1 : 1)"
      @keydown.esc.prevent.stop="close"
    />
    <span class="mono min-w-[64px] flex-none whitespace-nowrap text-right text-[10.5px]" :class="q && !found.count ? 'text-(--red)' : 'text-(--fa)'">{{ count }}</span>
    <UTooltip text="Match case">
      <UButton color="neutral" variant="ghost" class="mono size-6 justify-center p-0 text-[11px]" :class="matchCase ? 'bg-(--sel) text-(--tx)' : 'text-(--fa)'" :aria-pressed="matchCase" @click="matchCase = !matchCase">Aa</UButton>
    </UTooltip>
    <UTooltip text="Previous match (Shift Enter)">
      <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0 text-(--fa)" @click="go(-1)"><UIcon name="i-hugeicons-arrow-up-01" class="size-3.5" /></UButton>
    </UTooltip>
    <UTooltip text="Next match (Enter)">
      <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0 text-(--fa)" @click="go(1)"><UIcon name="i-hugeicons-arrow-down-01" class="size-3.5" /></UButton>
    </UTooltip>
    <UTooltip :text="`Close (Esc, or ${prefs.kl('find')})`">
      <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0 text-(--fa)" @click="close"><UIcon name="i-hugeicons-cancel-01" class="size-3" /></UButton>
    </UTooltip>
  </div>
</template>
