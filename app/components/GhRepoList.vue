<script setup lang="ts">
// Every repo the user can reach, the most recently pushed first, like GitHub's own list. Searching
// covers them all at once, by name, owner and description; Enter opens the first match.
const G = useGithubStore()
const GW = useGhWorldStore()
const ui = useUiStore()
const prefs = usePrefsStore()

const LATEST = 30
const query = ref('')
const archived = ref(false)
const input = ref<{ inputRef?: HTMLInputElement } | null>(null)

/** Each word has to appear somewhere in the name or description, in any order. */
const matches = computed(() => {
  const words = query.value.toLowerCase().split(/\s+/).filter(Boolean)
  const list = (G.repoList || []).filter(r => archived.value || !r.archived)
  if (!words.length) return list.slice(0, LATEST)
  return list.filter((r) => {
    const hay = `${r.name} ${r.description}`.toLowerCase()
    return words.every(w => hay.includes(w))
  }).slice(0, 100)
})

/** What GitHub HQ knows: whether it's a Canopy project's repo, and its alert counts. */
const known = computed(() => new Map((GW.world?.repos || []).map(r => [r.name.toLowerCase(), r])))

const LANG: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', PHP: '#4f5d95', Vue: '#41b883', Python: '#3572a5', Go: '#00add8', Blade: '#f7523f',
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Shell: '#89e051', Ruby: '#701516', Java: '#b07219', 'C#': '#178600', Dockerfile: '#384d54',
}

const { sel } = useGhList(() => matches.value, r => G.openRepo(r.name), () => ({
  ghSearch: { run: () => input.value?.inputRef?.focus(), hint: 'search' },
  ghRunWorkflow: { run: () => { const r = matches.value[sel.value]; if (r) G.dispatch = r.name }, hint: 'run workflow' },
  ghBrowser: { run: () => { const r = matches.value[sel.value]; if (r) api.sys.openExternal(r.url) }, hint: 'browser' },
  ghRefresh: { run: () => G.load('repos', true) },
}))

/** In the search box: Enter opens the selected match, ↓ goes down into the list, Esc clears the search first. */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && matches.value[sel.value]) G.openRepo(matches.value[sel.value]!.name)
  else if (e.key === 'ArrowDown') {
    e.preventDefault()
    focusGhWindow()
  } else if (e.key === 'Escape' && query.value) {
    e.stopPropagation()
    query.value = ''
  }
}

watch(query, () => { sel.value = 0 })
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-12 flex-none items-center gap-2.5 border-b border-(--ln2) px-4">
      <UInput
        ref="input"
        v-model="query"
        icon="i-hugeicons-search-01"
        :placeholder="`Find a repo… (${prefs.kl('ghSearch')})`"
        variant="none"
        class="flex-1"
        :ui="{ base: 'h-[30px] rounded-md border border-(--ln) bg-(--inp) pl-8 text-[12.5px] text-(--tx) placeholder:text-(--fa)', leadingIcon: 'size-4 text-(--fa)' }"
        @keydown="onKey"
      />
      <label class="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px] text-(--tx2)">
        <input v-model="archived" type="checkbox" class="accent-(--grn)">Archived
      </label>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="!!G.busy.repos" title="Refresh" @click="G.load('repos', true)" />
    </div>
    <div class="flex h-8 flex-none items-center px-4 text-[11.5px] text-(--fa)">
      <template v-if="G.repoList">
        {{ query.trim() ? `${matches.length}${matches.length === 100 ? '+' : ''} matching` : `Latest ${Math.min(LATEST, matches.length)} of ${G.repoList.length}, by last push` }}
      </template>
    </div>
    <div v-if="G.errors.repos" class="px-4 pb-2 text-[12px] text-(--red)">{{ G.errors.repos }}</div>
    <div class="min-h-0 flex-1 overflow-auto border-t border-(--ln2)">
      <div v-if="!G.repoList" class="grid h-32 place-items-center text-[12px] text-(--fa)">Reading your repos…</div>
      <div v-else-if="!matches.length" class="grid h-32 place-items-center text-[12px] text-(--fa)">No repos match “{{ query }}”.</div>
      <button
        v-for="(r, i) in matches"
        :key="r.name"
        class="flex w-full cursor-pointer items-start gap-3 border-b border-(--ln2) px-4 py-2.5 text-left hover:bg-(--hov)"
        :class="i === sel && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
        :data-gh-sel="i === sel"
        @click="G.openRepo(r.name)"
      >
        <UIcon name="i-hugeicons-book-02" class="mt-0.5 size-4 flex-none text-(--mu)" />
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <div class="flex min-w-0 items-center gap-1.5">
            <span class="ellipsis text-[13px]"><span class="text-(--mu)">{{ r.name.split('/')[0] }}/</span><span class="font-semibold text-(--tx)">{{ repoShort(r.name) }}</span></span>
            <span v-if="r.private" class="flex-none rounded-full border border-(--ln) px-1.5 text-[10px] text-(--mu)">Private</span>
            <span v-if="r.archived" class="flex-none rounded-full border border-(--amb)/40 px-1.5 text-[10px] text-(--amb)">Archived</span>
            <span v-if="r.fork" class="flex-none rounded-full border border-(--ln) px-1.5 text-[10px] text-(--mu)">Fork</span>
            <span v-if="known.get(r.name.toLowerCase())?.canopy" class="flex-none rounded-full bg-(--grn)/15 px-1.5 text-[10px] text-(--grn)">In Canopy</span>
          </div>
          <span v-if="r.description" class="ellipsis text-[12px] text-(--tx2)">{{ r.description }}</span>
          <span class="flex items-center gap-3 text-[11px] text-(--mu)">
            <span v-if="r.language" class="flex items-center gap-1"><span class="h-2 w-2 rounded-full" :style="{ background: LANG[r.language] || 'var(--fa)' }" />{{ r.language }}</span>
            <span v-if="r.stars">★ {{ r.stars }}</span>
            <span>Updated {{ ago(ui.now - r.pushedAt) }} ago</span>
          </span>
        </div>
        <span v-if="known.get(r.name.toLowerCase())?.alerts?.critical" class="mt-0.5 flex-none rounded-sm px-1.5 text-[10.5px] font-semibold" :style="{ color: SEV_DOT.critical, background: `color-mix(in oklch, ${SEV_DOT.critical} 15%, transparent)` }">
          {{ known.get(r.name.toLowerCase())!.alerts!.critical }} critical
        </span>
      </button>
    </div>
  </div>
</template>
