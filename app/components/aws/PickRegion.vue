<script setup lang="ts">
// Picks the region: aws-tui's common regions, each marked once the account's opt-ins are known
// (a region it hasn't opted into won't answer), and + to type any other.
import { useEventListener } from '@vueuse/core'

const A = useAwsStore()

const REGIONS: { code: string; name: string }[] = [
  { code: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
  { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
  { code: 'ap-southeast-4', name: 'Asia Pacific (Melbourne)' },
  { code: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
  { code: 'us-east-1', name: 'US East (N. Virginia)' },
  { code: 'us-east-2', name: 'US East (Ohio)' },
  { code: 'us-west-1', name: 'US West (N. California)' },
  { code: 'us-west-2', name: 'US West (Oregon)' },
  { code: 'eu-west-1', name: 'Europe (Ireland)' },
  { code: 'eu-west-2', name: 'Europe (London)' },
  { code: 'eu-central-1', name: 'Europe (Frankfurt)' },
]

type Row = { code: string; name: string; status: string }
const optIn = ref<Record<string, string>>({})
const custom = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

const rows = computed<Row[]>(() => {
  const list: Row[] = REGIONS.map(r => ({ ...r, status: optIn.value[r.code] || '' }))
  // The region in use, when it isn't a common one.
  if (A.region && !list.some(r => r.code === A.region)) list.unshift({ code: A.region, name: '', status: optIn.value[A.region] || '' })
  return list
})

const close = () => { A.picker = null }

const t = useAwsTable<Row>({
  rows: () => rows.value,
  columns: () => [
    { key: 'code', label: 'Region', value: r => r.code, mono: true },
    { key: 'name', label: 'Name', value: r => r.name, flex: true },
    { key: 'status', label: 'Status', value: r => (r.status === 'not-opted-in' ? '⚠ opt-in needed' : r.status ? '✓' : ''), color: r => (r.status === 'not-opted-in' ? 'var(--amb)' : 'var(--grn)') },
  ],
  filter: (r, q) => matches(q, r.code, r.name),
  open: r => A.useRegion(r.code),
  openHint: 'use',
  modal: true,
  back: () => (custom.value !== null ? (custom.value = null) : close()),
})

function askCustom() {
  custom.value = ''
  nextTick(() => input.value?.focus())
}

function useCustom() {
  const r = (custom.value || '').trim()
  if (/^[a-z]{2}(-[a-z]+)+-\d$/.test(r)) A.useRegion(r)
}

function onCustomKey(e: KeyboardEvent) {
  if (e.key === 'Enter') useCustom()
  else if (e.key === 'Escape') {
    e.stopPropagation()
    custom.value = null
    focusAwsWindow()
  }
}

// + types any region, as in aws-tui.
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === '+' && custom.value === null && !(e.target as HTMLElement).closest('input')) {
    e.preventDefault()
    askCustom()
  }
})

onMounted(async () => {
  const want = A.region || A.lastRegions[A.profile] || A.profiles.find(p => p.name === A.profile)?.region
  const i = t.shown.value.findIndex(r => r.code === want)
  if (i >= 0) t.sel.value = i
  // Any region answers this; us-east-1 when none is picked yet.
  const r = await api.aws.regions({ profile: A.profile, region: A.region || 'us-east-1' })
  if (r.ok) optIn.value = Object.fromEntries(r.data.map(x => [x.name, x.status]))
})
</script>

<template>
  <AwsDialog title="Region" :sub="`for ${A.profile}`" @close="close">
    <AwsGrid :t="t" title="Regions" :row-key="r => r.code" class="min-h-[400px]" @open="r => A.useRegion(r.code)" @refresh="() => {}">
      <template #actions>
        <UButton size="xs" color="neutral" variant="ghost" label="+ other" title="Type any region (+)" @click="askCustom" />
      </template>
    </AwsGrid>
    <div v-if="custom !== null" class="flex flex-none items-center gap-2 border-t border-(--ln2) px-4 py-2">
      <span class="text-[12px] text-(--mu)">Region</span>
      <input ref="input" v-model="custom" placeholder="eu-north-1" class="mono h-7 flex-1 rounded-md border border-(--ln) bg-(--inp) px-2 text-[12px] text-(--tx) outline-none" @keydown="onCustomKey">
      <UButton size="xs" color="primary" label="Use" @click="useCustom" />
    </div>
  </AwsDialog>
</template>
