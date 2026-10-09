<script setup lang="ts">
// SecurityHub, read-only: insights (the account's own first), an insight's results grouped by
// resource, account, severity and so on, the findings behind a result or all active ones, and a
// finding's details with its remediation. 1 to 5 show or hide a severity; suppressed findings stay
// hidden unless asked for.
import { useEventListener } from '@vueuse/core'
import type { ShFinding, ShInsight, ShInsightResult } from '#shared/aws'

const A = useAwsStore()
const ui = useUiStore()

const insights = useAwsLoad((ctx, force: boolean) => api.aws.shInsights(ctx, force))
const results = useAwsLoad((ctx, arn: string) => api.aws.shInsightResults(ctx, arn))
const findings = useAwsLoad((ctx, q: { group: { attr: string; value: string } | null }) => api.aws.shFindings(ctx, q))

type Mode = 'insights' | 'results' | 'findings' | 'finding'
const mode = ref<Mode>('insights')
const insight = ref<ShInsight | null>(null)
const scope = ref('')
const fromResults = ref(false)
const finding = ref<ShFinding | null>(null)
const lastQuery = ref<{ group: { attr: string; value: string } | null }>({ group: null })

const SEVS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'] as const
const sevOn = ref<Record<string, boolean>>({ CRITICAL: true, HIGH: true, MEDIUM: true, LOW: true, INFORMATIONAL: false })
const suppressed = ref(false)

const it = useAwsTable<ShInsight>({
  rows: () => insights.data.value || [],
  columns: () => [
    { key: 'name', label: 'Name', value: i => i.name, flex: true },
    { key: 'group', label: 'Group by', value: i => i.groupBy },
    { key: 'owner', label: 'Source', value: i => i.owner },
  ],
  filter: (i, q) => matches(q, i.name),
  active: () => mode.value === 'insights',
  open: i => openInsight(i),
  openHint: 'results',
  keys: i => ({
    awsRefresh: { run: () => insights.load(true) },
    awsShAll: { run: () => openFindings('All active findings', null, false), hint: 'all findings' },
    ...(i ? { awsBookmark: { run: () => A.toggleBookmark('SecurityHub', i.name, i.name) } } : {}),
  }),
})

function openInsight(i: ShInsight) {
  insight.value = i
  mode.value = 'results'
  results.load(i.arn)
}

const rt = useAwsTable<ShInsightResult>({
  rows: () => results.data.value || [],
  columns: () => [
    { key: 'value', label: 'Group value', value: r => r.value, flex: true, mono: true },
    { key: 'count', label: 'Count', value: r => r.count, sort: 'num', align: 'right' },
  ],
  filter: (r, q) => matches(q, r.value),
  active: () => mode.value === 'results',
  open: r => openFindings(`${insight.value!.groupBy}: ${r.value}`, { attr: insight.value!.attr, value: r.value }, true),
  openHint: 'findings',
  back: () => { mode.value = 'insights' },
  keys: () => ({ awsRefresh: { run: () => insight.value && results.load(insight.value.arn) } }),
})

function openFindings(title: string, group: { attr: string; value: string } | null, viaResults: boolean) {
  scope.value = title
  fromResults.value = viaResults
  lastQuery.value = { group }
  mode.value = 'findings'
  ft.query.value = ''
  findings.load({ group })
}

const ft = useAwsTable<ShFinding>({
  rows: () => (findings.data.value?.findings || []).filter(f => sevOn.value[f.severity] !== false && (suppressed.value || f.workflow !== 'SUPPRESSED')),
  columns: () => [
    { key: 'sev', label: 'Sev', value: f => SH_SEV[f.severity]?.rank || 0, text: f => SH_SEV[f.severity]?.label || f.severity, sort: 'num' },
    { key: 'title', label: 'Title', value: f => f.title, flex: true },
    { key: 'product', label: 'Product', value: f => f.product },
    { key: 'age', label: 'Age', value: f => f.updatedAt, text: f => age(f.updatedAt, ui.now), sort: 'time' },
  ],
  filter: (f, q) => matches(q, f.title, f.product, ...f.resources.map(r => r.arn)),
  active: () => mode.value === 'findings',
  open: f => { finding.value = f; mode.value = 'finding' },
  openHint: 'details',
  back: () => { mode.value = fromResults.value ? 'results' : 'insights' },
  keys: f => ({
    awsRefresh: { run: () => findings.load(JSON.parse(JSON.stringify(lastQuery.value))) },
    awsShSuppressed: { run: () => { suppressed.value = !suppressed.value }, hint: 'suppressed' },
    ...(f ? { awsCopy: { run: () => copyFinding(f) } } : {}),
  }),
})

function copyFinding(f: ShFinding) {
  A.choose('Copy', [
    { key: 'a', label: 'id', run: () => copyText(f.id) },
    { key: 't', label: 'title', run: () => copyText(f.title) },
    { key: 'l', label: 'remediation URL', run: () => (f.remediation.url ? copyText(f.remediation.url) : ui.toast({ title: 'No remediation link' })) },
  ])
}

// 1 to 5 show or hide a severity, as in aws-tui; only while SecurityHub is the service showing.
const showing = ref(true)
onActivated(() => { showing.value = true })
onDeactivated(() => { showing.value = false })
useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (!showing.value || A.term || A.finder || A.picker || A.help || A.bookmarksOpen || A.links || mode.value !== 'findings' || A.choice || A.ask || (e.target as HTMLElement).closest('input, textarea') || e.ctrlKey || e.altKey) return
  const i = Number(e.key) - 1
  const s = SEVS[i]
  if (!s) return
  e.preventDefault()
  sevOn.value = { ...sevOn.value, [s]: !sevOn.value[s] }
})

useAwsKeys(() => (mode.value === 'finding' && finding.value
  ? { keys: { awsBack: { run: () => { mode.value = 'findings' } }, awsCopy: { run: () => copyFinding(finding.value!), hint: 'copy' } } }
  : { keys: {} }))

useAwsJump('SecurityHub', (q) => {
  mode.value = 'insights'
  it.query.value = q
})

onMounted(() => insights.load(false))
</script>

<template>
  <AwsGrid
    v-if="mode === 'insights'"
    :t="it"
    title="SecurityHub insights"
    :busy="insights.busy.value"
    :error="insights.error.value"
    :at="insights.at.value"
    :waiting="!insights.data.value"
    :row-key="i => i.arn"
    :empty="`No insights. If SecurityHub isn't on in ${A.region}: aws securityhub enable-security-hub --region ${A.region} --profile ${A.profile}`"
    @open="openInsight"
    @refresh="insights.load(true)"
  >
    <template #actions>
      <UButton size="xs" color="neutral" variant="subtle" label="All findings" @click="openFindings('All active findings', null, false)" />
    </template>
  </AwsGrid>

  <AwsGrid
    v-else-if="mode === 'results' && insight"
    :t="rt"
    :title="insight.name"
    :sub="results.data.value ? `grouped by ${insight.groupBy} · ${results.data.value.reduce((a, r) => a + r.count, 0)} findings` : ''"
    :busy="results.busy.value"
    :error="results.error.value"
    :at="results.at.value"
    :waiting="!results.data.value"
    :row-key="r => r.value"
    empty="Nothing matches this insight."
    @open="r => openFindings(`${insight!.groupBy}: ${r.value}`, { attr: insight!.attr, value: r.value }, true)"
    @refresh="results.load(insight.arn)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'insights'" />
    </template>
  </AwsGrid>

  <AwsGrid
    v-else-if="mode === 'findings'"
    :t="ft"
    :title="`Findings: ${scope}`"
    :sub="findings.data.value?.capped ? 'the first 500; narrow it through an insight' : ''"
    :busy="findings.busy.value"
    :error="findings.error.value"
    :at="findings.at.value"
    :waiting="!findings.data.value"
    :row-key="f => f.id"
    empty="No findings with these severities."
    @open="f => { finding = f; mode = 'finding' }"
    @refresh="findings.load(JSON.parse(JSON.stringify(lastQuery)))"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = fromResults ? 'results' : 'insights'" />
    </template>
    <template #top>
      <div class="flex h-9 flex-none items-center gap-1.5 border-b border-(--ln2) px-4 text-[11.5px]">
        <button
          v-for="(s, i) in SEVS"
          :key="s"
          class="cursor-pointer rounded-sm px-1.5 py-px font-semibold"
          :style="sevOn[s] ? { background: SH_SEV[s]!.color, color: '#131417' } : { color: 'var(--fa)', outline: '1px solid var(--ln)' }"
          @click="sevOn = { ...sevOn, [s]: !sevOn[s] }"
        >{{ i + 1 }} {{ SH_SEV[s]!.label }}</button>
        <button
          class="ml-2 cursor-pointer rounded-sm px-1.5 py-px"
          :class="suppressed ? 'bg-(--chip) text-(--tx)' : 'text-(--fa) outline outline-1 outline-(--ln)'"
          @click="suppressed = !suppressed"
        >x Suppressed</button>
      </div>
    </template>
    <template #cell-sev="{ row }">
      <span class="rounded-sm px-1.5 py-px text-[10.5px] font-bold" :style="{ background: SH_SEV[row.severity]?.color || 'var(--chip)', color: '#131417' }">{{ SH_SEV[row.severity]?.label || row.severity }}</span>
    </template>
  </AwsGrid>

  <div v-else-if="mode === 'finding' && finding" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'findings'" />
      <span class="rounded-sm px-1.5 py-px text-[10.5px] font-bold" :style="{ background: SH_SEV[finding.severity]?.color, color: '#131417' }">{{ SH_SEV[finding.severity]?.label }}</span>
      <span class="ellipsis text-[13px] font-semibold">{{ finding.title }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Severity', v: finding.severity, color: SH_SEV[finding.severity]?.color },
          { k: 'Workflow', v: finding.workflow },
          { k: 'State', v: finding.recordState },
          { k: 'Updated', v: awsTime(finding.updatedAt) },
          { k: 'Product', v: finding.product },
          { k: 'Region', v: finding.region },
          { k: 'Account', v: finding.account, mono: true },
          { k: 'Compliance', v: finding.compliance },
          { k: 'Standards', v: finding.standards },
        ]"
      />
      <div class="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Resources</div>
      <div v-for="r in finding.resources" :key="r.arn" class="mono select-text text-[12px] text-(--tx2)">{{ r.arn }} <span class="text-(--fa)">({{ r.type }})</span></div>
      <div class="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Description</div>
      <p class="max-w-[820px] select-text whitespace-pre-line text-[12.5px] leading-[1.55] text-(--tx2)">{{ finding.description || '-' }}</p>
      <div class="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Remediation</div>
      <p class="max-w-[820px] select-text whitespace-pre-line text-[12.5px] leading-[1.55] text-(--tx2)">{{ finding.remediation.text || '-' }}</p>
      <button v-if="finding.remediation.url" class="mt-1 cursor-pointer text-[12px] text-(--lnk) hover:underline" @click="api.sys.openExternal(finding.remediation.url)">{{ finding.remediation.url }}</button>
    </div>
  </div>
</template>
