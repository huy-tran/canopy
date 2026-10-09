<script setup lang="ts">
// Elastic Beanstalk, aws-tui's first tab: environments with their health and version, an
// environment's details and latest events, its full event log, and deploying a version to it.
// A production environment (one with "prod" in its name) asks for its name typed before a deploy.
// The list is read every 10 seconds while an environment is changing.
import type { EbEnv, EbEvent, EbVersion } from '#shared/aws'
import type { AwsLine } from '~/utils/aws'

const A = useAwsStore()
const AW = useAwsWorldStore()
const ui = useUiStore()

const mode = ref<'list' | 'details' | 'events' | 'deploy'>('list')
const envName = ref<string | null>(null)
const env = computed(() => AW.world?.envs.find(e => e.env === envName.value) || null)
const events = useAwsLoad((ctx, name: string) => api.aws.ebEvents(ctx, name))
const versions = useAwsLoad((ctx, app: string, force: boolean) => api.aws.ebVersions(ctx, app, force))

function open(e: EbEnv, m: typeof mode.value = 'details') {
  envName.value = e.env
  mode.value = m
  if (m === 'deploy') versions.load(e.app, false)
  else events.load(e.env)
}

const back = () => {
  if (mode.value === 'events') mode.value = 'details'
  else mode.value = 'list'
}

const t = useAwsTable<EbEnv>({
  rows: () => AW.world?.envs || [],
  columns: () => [
    { key: 'name', label: 'App / Environment', value: e => `${e.app} / ${e.env}`, flex: true },
    { key: 'health', label: 'Health', value: e => e.health, align: 'center' },
    { key: 'status', label: 'Status', value: e => e.status, color: e => ebStatusColor(e.status) },
    { key: 'version', label: 'Version', value: e => e.version, mono: true },
  ],
  filter: (e, q) => matches(q, e.app, e.env, e.cname),
  active: () => mode.value === 'list',
  open: e => open(e),
  keys: (e) => {
    return e ? {
      awsEbEvents: { run: () => open(e, 'events'), hint: 'events' },
      awsEbDeploy: { run: () => open(e, 'deploy'), hint: 'deploy' },
      awsRefresh: { run: () => AW.read(true) },
      awsBookmark: { run: () => A.toggleBookmark('Beanstalk', e.env, `${e.app} / ${e.env}`) },
      awsRelated: { run: () => A.related(ebLinks(e)), hint: 'related' },
      awsCopy: { run: () => copyMenu(e) },
    } : { awsRefresh: { run: () => AW.read(true) } }
  },
})

function copyMenu(e: EbEnv) {
  A.choose('Copy', [
    { key: 'e', label: 'environment', run: () => copyText(e.env) },
    { key: 'c', label: 'CNAME', run: () => copyText(e.cname) },
    { key: 'v', label: 'version', run: () => copyText(e.version) },
  ])
}

const vt = useAwsTable<EbVersion>({
  rows: () => (mode.value === 'deploy' ? versions.data.value || [] : []),
  columns: () => [
    { key: 'label', label: 'Label', value: v => v.label, mono: true },
    { key: 'created', label: 'Created', value: v => v.createdAt, text: v => awsTime(v.createdAt, false), sort: 'time' },
    { key: 'status', label: 'Status', value: v => v.status },
    { key: 'desc', label: 'Description', value: v => v.description, flex: true },
  ],
  filter: (v, q) => matches(q, v.label, v.description),
  active: () => mode.value === 'deploy',
  open: v => deploy(v),
  openHint: 'deploy',
  back,
  keys: () => ({ awsRefresh: { run: () => env.value && versions.load(env.value.app, true) } }),
})

function deploy(v: EbVersion) {
  const e = env.value
  if (!e) return
  if (v.label === e.version) return ui.toast({ title: `${v.label} is already deployed to ${e.env}` })
  const run = async () => {
    const r = await api.aws.ebDeploy(A.c(), e.env, v.label)
    if (A.done(r, `Deploy started on ${e.env}`, `${v.label} replacing ${e.version}`)) {
      mode.value = 'list'
      AW.read(true)
    }
  }
  // aws-tui deploys a non-production environment straight away; production asks for its name.
  A.confirm({
    title: /prod/i.test(e.env) ? 'Confirm production deploy' : `Deploy to ${e.env}?`,
    body: `${e.app} / ${e.env}\nCurrently deployed: ${e.version}\nNew version: ${v.label}`,
    typed: /prod/i.test(e.env) ? e.env : undefined,
    ok: 'Deploy',
    run,
  })
}

const eventLines = computed<AwsLine[]>(() => (events.data.value || []).map((x: EbEvent) => ({
  pre: awsClock(x.at),
  tag: x.severity,
  tagColor: x.severity === 'ERROR' || x.severity === 'FATAL' ? 'var(--red)' : x.severity === 'WARN' ? 'var(--amb)' : 'var(--mu)',
  text: x.message,
})).reverse())

const lines = ref<{ scroll: (h: any) => void } | null>(null)
useAwsKeys(() => (mode.value === 'details' || mode.value === 'events') && env.value ? {
  keys: {
    awsBack: { run: back },
    awsEbEvents: { run: () => { mode.value = 'events' }, hint: 'events' },
    awsEbDeploy: { run: () => open(env.value!, 'deploy'), hint: 'deploy' },
    awsRefresh: { run: () => { events.load(env.value!.env); AW.read(true) } },
    awsBookmark: { run: () => A.toggleBookmark('Beanstalk', env.value!.env, `${env.value!.app} / ${env.value!.env}`) },
    awsRelated: { run: () => A.related(ebLinks(env.value!)), hint: 'related' },
    awsCopy: { run: () => copyMenu(env.value!) },
    awsDown: { run: () => lines.value?.scroll('down') },
    awsUp: { run: () => lines.value?.scroll('up') },
    awsPageDown: { run: () => lines.value?.scroll('pageDown') },
    awsPageUp: { run: () => lines.value?.scroll('pageUp') },
  },
} : { keys: {} })

useAwsJump('Beanstalk', (q) => {
  mode.value = 'list'
  t.query.value = q
})
</script>

<template>
  <AwsGrid
    v-if="mode === 'list'"
    :t="t"
    title="Elastic Beanstalk environments"
    :sub="AW.moving ? 'reading every 10s while an environment is changing' : ''"
    :busy="AW.loading"
    :error="AW.world?.error"
    :at="AW.world?.at"
    :waiting="!AW.world"
    :row-key="e => e.id"
    empty="No environments in this region."
    @open="e => open(e)"
    @refresh="AW.read(true)"
  >
    <template #cell-health="{ row }">
      <span :style="{ color: ebHealthColor(row.health) }">● {{ row.health || 'Grey' }}</span>
    </template>
    <template #cell-name="{ row }">
      <div class="ellipsis"><span class="text-(--mu)">{{ row.app }} / </span><span class="font-medium">{{ row.env }}</span><span v-if="A.isBookmarked('Beanstalk', row.env)" class="ml-1.5 text-(--amb)">★</span></div>
    </template>
  </AwsGrid>

  <AwsGrid
    v-else-if="mode === 'deploy'"
    :t="vt"
    :title="`Deploy to ${env?.env}`"
    :sub="`currently ${env?.version}`"
    :busy="versions.busy.value"
    :error="versions.error.value"
    :at="versions.at.value"
    :waiting="!versions.data.value"
    :row-key="v => v.label"
    empty="No application versions."
    @open="deploy"
    @refresh="env && versions.load(env.app, true)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="back" />
    </template>
    <template #cell-label="{ row }">
      <span class="mono" :class="row.label === env?.version && 'text-(--grn)'">{{ row.label }}{{ row.label === env?.version ? ' (deployed)' : '' }}</span>
    </template>
  </AwsGrid>

  <div v-else-if="env" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="back" />
      <span class="text-[13px] font-semibold">{{ env.app }} / {{ env.env }}</span>
      <span :style="{ color: ebHealthColor(env.health) }" class="text-[12px]">● {{ env.health }}</span>
      <span :style="{ color: ebStatusColor(env.status) }" class="text-[12px]">{{ env.status }}</span>
      <div class="flex-1" />
      <UButton size="xs" color="neutral" variant="subtle" :label="mode === 'events' ? 'Details' : 'All events'" @click="mode = mode === 'events' ? 'details' : 'events'" />
      <UButton size="xs" color="primary" variant="subtle" label="Deploy…" @click="open(env, 'deploy')" />
    </div>
    <template v-if="mode === 'details'">
      <div class="flex-none border-b border-(--ln2) px-5 py-4">
        <AwsKv
          :rows="[
            { k: 'Application', v: env.app },
            { k: 'Environment ID', v: env.id, mono: true },
            { k: 'CNAME', v: env.cname, mono: true },
            { k: 'Status', v: env.status, color: ebStatusColor(env.status) },
            { k: 'Health', v: env.health, color: ebHealthColor(env.health) },
            { k: 'Version', v: env.version, mono: true },
            { k: 'Tier', v: env.tier },
            { k: 'Platform', v: env.platform.split('platform/').pop() },
            { k: 'Last updated', v: awsTime(env.updatedAt) },
          ]"
        />
      </div>
      <div class="flex-none px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Latest events</div>
      <AwsLines ref="lines" tag-width="3.6em" :lines="eventLines.slice(-5)" :empty="events.busy.value ? 'Reading events…' : events.error.value || 'No events.'" class="max-h-[180px] flex-none" />
    </template>
    <AwsLines v-else ref="lines" tag-width="3.6em" :lines="eventLines" :empty="events.busy.value ? 'Reading events…' : events.error.value || 'No events.'" />
  </div>
</template>
