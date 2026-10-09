<script setup lang="ts">
// A list of open pull requests: the ones waiting for the user's review, or their own.
import type { GhPull } from '#shared/types'

const props = defineProps<{ pulls: GhPull[] | null; title: string; empty: string; busy: boolean; error?: string; oldestFirst?: boolean }>()

const G = useGithubStore()
const ui = useUiStore()

/** Waiting longest first for reviews, newest first for the user's own. */
const sorted = computed(() => [...(props.pulls || [])].sort((a, b) => (props.oldestFirst ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)))
const DAY = 86_400_000

const emit = defineEmits<{ refresh: [] }>()
const { sel } = useGhList(() => sorted.value, p => G.openPull(p.url), () => ({
  ghBrowser: { run: () => { const p = sorted.value[sel.value]; if (p) api.sys.openExternal(p.url) }, hint: 'browser' },
  ghRefresh: { run: () => emit('refresh'), hint: 'refresh' },
}))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <span class="text-[13px] font-semibold">{{ title }}</span>
      <span v-if="pulls" class="text-[12px] text-(--fa)">{{ pulls.length }}</span>
      <div class="flex-1" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="busy" title="Refresh" @click="$emit('refresh')" />
    </div>
    <div v-if="error" class="border-b border-(--ln2) px-4 py-2 text-[12px] text-(--red)">{{ error }}</div>
    <div class="min-h-0 flex-1 overflow-auto">
      <div v-if="!pulls" class="grid h-32 place-items-center text-[12px] text-(--fa)">Reading GitHub…</div>
      <div v-else-if="!sorted.length" class="grid h-32 place-items-center text-[12px] text-(--fa)">{{ empty }}</div>
      <button
        v-for="(p, i) in sorted"
        :key="p.url"
        class="flex w-full cursor-pointer items-center gap-3 border-b border-(--ln2) px-4 py-2.5 text-left hover:bg-(--hov)"
        :class="i === sel && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
        :data-gh-sel="i === sel"
        @click="G.openPull(p.url)"
      >
        <span class="h-2 w-2 flex-none rounded-full" :style="{ background: REVIEW_DOT[p.review] }" :title="REVIEW_LABEL[p.review]" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="ellipsis text-[13px] text-(--tx)">{{ p.title }}</span>
          <span class="ellipsis text-[11.5px] text-(--mu)">
            <span class="mono">{{ repoShort(p.repo) }} #{{ p.number }}</span> · {{ p.author }} · opened {{ ago(ui.now - p.createdAt) }} ago
          </span>
        </div>
        <span v-if="p.checks" class="flex flex-none items-center gap-1 text-[11px]" :style="{ color: CHECKS_DOT[p.checks] }">
          <span class="h-1.5 w-1.5 rounded-full" :style="{ background: CHECKS_DOT[p.checks] }" />{{ CHECKS_LABEL[p.checks] }}
        </span>
        <span
          v-if="oldestFirst && ui.now - p.createdAt > DAY"
          class="mono flex-none rounded-sm px-1.5 text-[10.5px] font-semibold"
          :class="ui.now - p.createdAt > 3 * DAY ? 'bg-(--red)/15 text-(--red)' : 'bg-(--ambf)/15 text-(--amb)'"
        >waiting {{ ago(ui.now - p.createdAt) }}</span>
      </button>
    </div>
  </div>
</template>
