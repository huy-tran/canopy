<script setup lang="ts">
// Open Dependabot alerts across the user's repos, most severe first: how many per repo, then each one.
import type { GhAlert } from '#shared/types'

const G = useGithubStore()
const ui = useUiStore()

const repo = ref('all')
const severity = ref<'severe' | 'all'>('severe')

const severe = (a: GhAlert) => a.severity === 'critical' || a.severity === 'high'

/** Per repo: counts by severity, worst repos first. */
const byRepo = computed(() => {
  const m = new Map<string, Record<GhAlert['severity'], number>>()
  for (const a of G.alerts || []) {
    const c = m.get(a.repo) || { critical: 0, high: 0, moderate: 0, low: 0 }
    c[a.severity]++
    m.set(a.repo, c)
  }
  return [...m].map(([name, c]) => ({ name, ...c })).sort((a, b) => b.critical - a.critical || b.high - a.high || b.moderate - a.moderate)
})

const shown = computed(() => (G.alerts || []).filter(a => (repo.value === 'all' || a.repo === repo.value) && (severity.value === 'all' || severe(a))))

const openUrl = (u: string) => api.sys.openExternal(u)

const { sel } = useGhList(() => shown.value, a => openUrl(a.url), () => ({
  ghBrowser: { run: () => { const a = shown.value[sel.value]; if (a) openUrl(a.url) }, hint: 'open alert' },
  ghRefresh: { run: () => G.load('security', true), hint: 'refresh' },
}))
watch([repo, severity], () => { sel.value = 0 })
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-4">
      <span class="text-[13px] font-semibold">Dependabot alerts</span>
      <span v-if="G.alerts" class="text-[12px] text-(--fa)">{{ G.alerts.length }} open</span>
      <div class="flex-1" />
      <Seg v-model="severity" size="sm" :items="[{ label: 'Critical and high', value: 'severe' }, { label: 'All', value: 'all' }]" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" :loading="!!G.busy.security" title="Refresh" @click="G.load('security', true)" />
    </div>

    <div v-if="!G.alerts" class="grid h-32 place-items-center text-[12px] text-(--fa)">Reading GitHub…</div>
    <div v-else-if="!G.alerts.length" class="grid h-32 place-items-center text-[12px] text-(--fa)">No open alerts in your repos.</div>

    <div v-else class="flex min-h-0 flex-1">
      <!-- Repos with alerts -->
      <div class="w-[260px] flex-none overflow-auto border-r border-(--ln2) py-1">
        <button
          class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-(--hov)"
          :class="repo === 'all' ? 'bg-(--hov) text-(--tx)' : 'text-(--tx2)'"
          @click="repo = 'all'"
        >
          <span class="flex-1 font-medium">All repos</span>
        </button>
        <button
          v-for="r in byRepo"
          :key="r.name"
          class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-(--hov)"
          :class="repo === r.name ? 'bg-(--hov) text-(--tx)' : 'text-(--tx2)'"
          :title="r.name"
          @click="repo = r.name"
        >
          <span class="ellipsis min-w-0 flex-1">{{ repoShort(r.name) }}</span>
          <span v-for="s in (['critical', 'high', 'moderate'] as const)" :key="s" class="mono w-6 flex-none text-right text-[10.5px]" :style="{ color: r[s] ? SEV_DOT[s] : 'var(--fa)' }" :title="SEV_LABEL[s]">{{ r[s] || '·' }}</span>
        </button>
      </div>

      <!-- The alerts -->
      <div class="min-h-0 min-w-0 flex-1 overflow-auto">
        <div v-if="!shown.length" class="grid h-32 place-items-center text-[12px] text-(--fa)">No {{ severity === 'severe' ? 'critical or high ' : '' }}alerts here.</div>
        <button
          v-for="(a, i) in shown"
          :key="`${a.repo}#${a.number}`"
          class="flex w-full cursor-pointer items-start gap-3 border-b border-(--ln2) px-4 py-2.5 text-left hover:bg-(--hov)"
          :class="i === sel && 'bg-(--hov) shadow-[inset_2px_0_0_var(--lnk)]'"
          :data-gh-sel="i === sel"
          @click="openUrl(a.url)"
        >
          <span class="mt-0.5 w-[62px] flex-none rounded-sm py-px text-center text-[10.5px] font-semibold" :style="{ color: SEV_DOT[a.severity], background: `color-mix(in oklch, ${SEV_DOT[a.severity]} 15%, transparent)` }">{{ SEV_LABEL[a.severity] }}</span>
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="ellipsis text-[13px] text-(--tx)"><span class="mono font-medium">{{ a.pkg }}</span><span class="text-(--mu)"> · {{ a.summary }}</span></span>
            <span class="ellipsis text-[11.5px] text-(--mu)">
              <span class="mono">{{ repoShort(a.repo) }}</span> · {{ a.manifest }} · {{ a.range }} ·
              <span :class="a.fixed ? 'text-(--grn)' : 'text-(--fa)'">{{ a.fixed ? `fixed in ${a.fixed}` : 'no fix yet' }}</span> · {{ ago(ui.now - a.createdAt) }} ago
            </span>
          </div>
          <UIcon name="i-hugeicons-link-square-02" class="mt-1 size-3.5 flex-none text-(--fa)" />
        </button>
      </div>
    </div>
  </div>
</template>
