<script setup lang="ts" generic="T">
// A table in the AWS window: a title line with the count and when it was read, the filter box, and
// the rows with the selected one marked. Keys come from useAwsTable; a click selects a row and a
// double click opens it. Cells can be replaced with a #cell-<key> slot.
import type { AwsTableState } from '~/composables/useAwsKeys'

const props = defineProps<{
  t: AwsTableState<T>
  title: string
  /** Shown after the title, such as "3 running, 2 stopped". */
  sub?: string
  busy?: boolean
  error?: string
  /** When the rows were read, for "read 12s ago". */
  at?: number
  empty?: string
  /** Before the first read. */
  waiting?: boolean
  rowKey: (row: T) => string
  /** A row shown dimmed, such as a stopped instance. */
  dim?: (row: T) => boolean
}>()

const emit = defineEmits<{ open: [row: T]; refresh: [] }>()

const ui = useUiStore()
const prefs = usePrefsStore()
const input = ref<HTMLInputElement | null>(null)

// Reopening the filter selects what's there, so typing replaces it.
watch(() => props.t.typing.value, (on) => { if (on) nextTick(() => input.value?.select()) })

/** Enter keeps the filter and goes back to the rows; Esc clears it. */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    props.t.typing.value = false
    focusAwsWindow()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    props.t.query.value = ''
    props.t.typing.value = false
    focusAwsWindow()
  }
}

const sortMark = (key: string) => {
  const s = props.t.sortBy.value
  return s?.key === key ? (s.desc ? ' ↓' : ' ↑') : ''
}

const total = computed(() => props.t.shown.value.length)
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <slot name="before" />
      <span class="text-[13px] font-semibold">{{ title }}</span>
      <span v-if="!waiting" class="text-[12px] text-(--fa)">{{ total }}{{ t.query.value ? ' matching' : '' }}</span>
      <span v-if="sub" class="ellipsis text-[12px] text-(--mu)">{{ sub }}</span>
      <div class="flex-1" />
      <slot name="actions" />
      <span v-if="at" class="whitespace-nowrap text-[11px] text-(--fa)">read {{ age(at, ui.now) }} ago</span>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="busy" :title="`Refresh (${prefs.kl('awsRefresh')})`" @click="emit('refresh')" />
    </div>
    <slot name="top" />
    <div v-if="t.typing.value || t.query.value" class="flex h-9 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <span class="mono text-[12px] text-(--lnk)">/</span>
      <input
        ref="input"
        v-model="t.query.value"
        class="mono h-7 flex-1 bg-transparent text-[12px] text-(--tx) outline-none placeholder:text-(--fa)"
        placeholder="filter"
        @keydown="onKey"
        @blur="t.typing.value = false"
      >
      <span class="text-[11px] text-(--fa)">Enter keeps · Esc clears</span>
    </div>
    <div v-if="error" class="flex-none px-4 py-2 text-[12px] text-(--red)">
      {{ error }} <span class="text-(--fa)">· {{ prefs.kl('awsRefresh') }} to try again</span>
    </div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div v-if="waiting && !error" class="grid h-32 place-items-center text-[12px] text-(--fa)">Reading AWS…</div>
      <div v-else-if="!waiting && !total && !error" class="grid h-32 place-items-center text-[12px] text-(--fa)">
        {{ t.query.value ? `Nothing matches “${t.query.value}”.` : empty || 'Nothing here.' }}
      </div>
      <table v-else-if="total" class="w-full border-collapse text-[12.5px]">
        <thead class="sticky top-0 z-[1] bg-(--modal)">
          <tr class="text-left text-[11px] text-(--mu)">
            <th
              v-for="c in t.columns.value"
              :key="c.key"
              class="whitespace-nowrap border-b border-(--ln2) px-3 py-1.5 font-medium first:pl-4"
              :class="[c.flex && 'w-full', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center']"
            >
              {{ c.label }}{{ sortMark(c.key) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in t.shown.value"
            :key="rowKey(row)"
            class="cursor-pointer border-b border-(--ln2) hover:bg-(--hov)"
            :class="[i === t.sel.value && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]', dim?.(row) && 'opacity-55']"
            :data-aws-sel="i === t.sel.value"
            @click="t.sel.value = i"
            @dblclick="emit('open', row)"
          >
            <td
              v-for="c in t.columns.value"
              :key="c.key"
              class="px-3 py-[7px] first:pl-4"
              :class="[c.flex ? 'w-full max-w-0' : 'whitespace-nowrap', c.align === 'right' && 'text-right', c.align === 'center' && 'text-center', c.mono && 'mono text-[11.5px]']"
              :style="c.color ? { color: c.color(row) } : undefined"
            >
              <slot :name="`cell-${c.key}`" :row="row">
                <div :class="c.flex ? 'ellipsis' : ''">{{ c.text ? c.text(row) : c.value(row) }}</div>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
