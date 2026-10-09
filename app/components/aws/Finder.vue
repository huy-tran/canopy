<script setup lang="ts">
// Finds anything across nine services at once (all but SecurityHub), as aws-tui's ctrl+k does:
// every word has to match; exact names rank first, then names starting with it, then names
// containing it, then the rest. Enter jumps to it in its service.
import type { AwsSearchItem } from '#shared/aws'

const A = useAwsStore()

const items = ref<AwsSearchItem[] | null>(null)
const failed = ref<string[]>([])
const query = ref('')
const sel = ref(0)
const input = ref<HTMLInputElement | null>(null)

function score(it: AwsSearchItem, words: string[]) {
  const label = it.label.toLowerCase()
  const rest = `${it.detail} ${it.query} ${it.tab}`.toLowerCase()
  let s = 0
  for (const w of words) {
    if (label === w) s += 100
    else if (label.startsWith(w)) s += 50
    else if (label.includes(w)) s += 20
    else if (rest.includes(w)) s += 5
    else return -1
  }
  return s
}

const results = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean)
  const list = items.value || []
  if (!words.length) return list.slice(0, 200)
  return list.map(it => ({ it, s: score(it, words) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 500).map(x => x.it)
})

watch(query, () => { sel.value = 0 })

function go(it?: AwsSearchItem) {
  if (it) A.jumpTo(it.tab, it.query)
}

function move(d: number) {
  const n = results.value.length
  if (!n) return
  sel.value = Math.min(n - 1, Math.max(0, sel.value + d))
  nextTick(() => document.querySelector('[data-aws-find="true"]')?.scrollIntoView({ block: 'nearest' }))
}

/** Every key goes to the search box; the arrows move, Enter jumps, Esc closes. */
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
    e.preventDefault()
    move({ ArrowDown: 1, ArrowUp: -1, PageDown: 12, PageUp: -12 }[e.key])
  } else if (e.key === 'Enter') {
    e.preventDefault()
    go(results.value[sel.value])
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    A.finder = false
    focusAwsWindow()
  }
}

useAwsKeys(() => ({ modal: true, keys: { awsBack: { run: () => { A.finder = false } } } }))

onMounted(async () => {
  nextTick(() => input.value?.focus())
  const r = await api.aws.search(A.c())
  items.value = r.items
  failed.value = r.failed
})
</script>

<template>
  <AwsDialog title="Find" sub="across every service but SecurityHub" width="720px" @close="A.finder = false">
    <div class="flex h-11 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <UIcon name="i-hugeicons-search-01" class="size-4 text-(--fa)" />
      <input ref="input" v-model="query" class="h-8 flex-1 bg-transparent text-[13px] text-(--tx) outline-none placeholder:text-(--fa)" placeholder="An instance, environment, bucket, log group, parameter…" @keydown="onKey">
      <span v-if="!items" class="text-[11px] text-(--fa)">reading nine services…</span>
      <span v-else class="text-[11px] text-(--fa)">{{ results.length }} of {{ items.length }}</span>
    </div>
    <div v-if="failed.length" class="flex-none px-4 py-1.5 text-[11.5px] text-(--amb)">Could not read {{ failed.join(', ') }}.</div>
    <div class="min-h-[300px] flex-1 overflow-auto">
      <button
        v-for="(it, i) in results"
        :key="`${it.tab}|${it.query}|${i}`"
        class="flex w-full cursor-pointer items-center gap-3 border-b border-(--ln2) px-4 py-2 text-left text-[12.5px] hover:bg-(--hov)"
        :class="i === sel && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
        :data-aws-find="i === sel"
        @click="go(it)"
      >
        <span class="w-[110px] flex-none text-[11.5px] text-(--mu)">{{ it.tab }}</span>
        <span class="ellipsis min-w-0 flex-1 font-medium text-(--tx)">{{ it.label }}</span>
        <span class="ellipsis max-w-[40%] flex-none text-[11.5px] text-(--mu)">{{ it.detail }}</span>
      </button>
    </div>
  </AwsDialog>
</template>
