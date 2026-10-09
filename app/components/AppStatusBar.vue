<script setup lang="ts">
const ui = useUiStore()
const S = useSessionsStore()
const prefs = usePrefsStore()
const costs = useCostsStore()

onMounted(() => costs.start())

const roomy = computed(() => ui.width >= 1100)
const ucol = (v: number) => (v < 50 ? 'var(--grn)' : v < 80 ? 'var(--ambf)' : 'var(--red)')

function resetText(ts: number | undefined, weekly: boolean) {
  if (!ts) return ''
  if (weekly) {
    const d = new Date(ts)
    return `resets ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${clock(ts)}`
  }
  return `resets ${clock(ts)} · in ${dur(ts - ui.now)}`
}

const bars = computed(() => [
  { key: 'five', label: ui.wide ? '5-hour' : '5h', title: 'Claude plan · 5-hour limit', w: ui.usage?.five, weekly: false },
  { key: 'week', label: ui.wide ? 'Weekly' : 'Wk', title: 'Claude plan · weekly limit', w: ui.usage?.week, weekly: true },
])

const counts = computed(() => {
  const c = { working: 0, waiting: 0, done: 0 }
  S.sessions.forEach((s) => { if (s.status in c) c[s.status as keyof typeof c]++ })
  return c
})

const countChips = computed(() => [
  { key: 'working', title: 'Working', n: counts.value.working, color: SC.working },
  { key: 'waiting', title: `Waiting on you · click to jump (${prefs.kl('nextWaiting')})`, n: counts.value.waiting, color: SC.waiting, click: () => ui.nextWaiting() },
  { key: 'done', title: 'Done', n: counts.value.done, color: SC.done },
])
</script>

<template>
  <div class="flex h-7 flex-none items-center gap-4 overflow-hidden whitespace-nowrap border-t border-(--ln) bg-(--chrome) px-3 text-[11px] text-(--mu)">
    <UTooltip v-for="b in bars" :key="b.key" :text="b.title">
      <div class="flex items-center gap-[7px]">
        <span class="text-(--tx2)">{{ b.label }}</span>
        <UProgress
          :model-value="b.w ? Math.min(100, b.w.pct) : 0"
          :max="100"
          :ui="{ root: 'gap-0', base: 'h-[5px] rounded-sm bg-(--trk)', indicator: 'rounded-sm' }"
          :style="{ width: ui.wide ? '96px' : '52px', '--ui-primary': ucol(b.w?.pct ?? 0) }"
        />
        <span class="mono text-[10.5px]">{{ b.w ? Math.round(b.w.pct) + '%' : '-' }}</span>
        <span v-if="roomy && b.w?.resetsAt">{{ resetText(b.w.resetsAt, b.weekly) }}</span>
      </div>
    </UTooltip>
    <PerfMeter v-if="prefs.prefs.showMetrics" />
    <div class="flex-1" />
    <div class="flex items-center gap-1.5">
      <UTooltip v-for="c in countChips" :key="c.key" :text="c.title">
        <UBadge
          :class="[c.click ? 'cursor-pointer' : '', c.n ? '' : 'opacity-50']"
          :style="{ background: `color-mix(in oklch, ${c.color} 16%, transparent)`, color: c.color }"
          :ui="{ base: 'mono h-[18px] gap-[5px] rounded-sm px-1.5 py-0 text-[10.5px] font-medium ring-0' }"
          @click="c.click?.()"
        >
          <span class="h-1.5 w-1.5 flex-none rounded-full" :style="{ background: c.color }" />{{ c.n }}
        </UBadge>
      </UTooltip>
    </div>
    <div class="flex items-center gap-1.5">
      <span>Today</span><span class="mono text-[11px] text-(--tx)">{{ usd(costs.total) }}</span>
    </div>
    <span class="flex cursor-pointer items-center gap-1 text-(--tx3) hover:text-(--tx)" @click="prefs.toggleTheme()"><UIcon :name="prefs.resolvedTheme === 'light' ? 'i-hugeicons-moon-02' : 'i-hugeicons-sun-03'" class="size-3" />{{ prefs.resolvedTheme === 'light' ? 'Dark' : 'Light' }}</span>
    <UTooltip text="Keyboard shortcuts">
      <UKbd
        value="?"
        class="mono box-border grid h-[18px] w-[18px] cursor-pointer place-items-center rounded-sm border border-(--bb) bg-transparent p-0 text-[10.5px] text-(--tx3) ring-0 hover:text-(--tx)"
        @click="ui.openSettings('keys')"
      />
    </UTooltip>
  </div>
</template>
