<script setup lang="ts">
// CodeDeploy, read-only: applications, an application's deployment groups and how their last
// deployment went, a group's deployments, newest first, and a deployment's details.
import type { CdApp, CdDeployment, CdGroup } from '#shared/aws'

const A = useAwsStore()

const apps = useAwsLoad((ctx, force: boolean) => api.aws.cdApps(ctx, force))
const groups = useAwsLoad((ctx, app: string, force: boolean) => api.aws.cdGroups(ctx, app, force))
const deps = useAwsLoad((ctx, app: string, group: string, force: boolean) => api.aws.cdDeployments(ctx, app, group, force))

const mode = ref<'apps' | 'groups' | 'deployments' | 'detail'>('apps')
const app = ref('')
const group = ref('')
const dep = ref<CdDeployment | null>(null)

const at = useAwsTable<CdApp>({
  rows: () => apps.data.value || [],
  columns: () => [
    { key: 'name', label: 'Application', value: a => a.name, flex: true },
    { key: 'platform', label: 'Platform', value: a => a.platform },
    { key: 'created', label: 'Created', value: a => a.createdAt, text: a => awsDate(a.createdAt), sort: 'time' },
  ],
  filter: (a, q) => matches(q, a.name, a.platform),
  active: () => mode.value === 'apps',
  open: a => { app.value = a.name; mode.value = 'groups'; gt.query.value = ''; groups.load(a.name, false) },
  openHint: 'groups',
  keys: a => ({
    awsRefresh: { run: () => apps.load(true) },
    ...(a ? { awsBookmark: { run: () => A.toggleBookmark('CodeDeploy', a.name, a.name) }, awsCopy: { run: () => copyText(a.name) } } : {}),
  }),
})

const gt = useAwsTable<CdGroup>({
  rows: () => groups.data.value || [],
  columns: () => [
    { key: 'name', label: 'Deployment group', value: g => g.name, flex: true },
    { key: 'platform', label: 'Platform', value: g => g.platform },
    { key: 'status', label: 'Last status', value: g => g.lastStatus || '-', color: g => cdStatusColor(g.lastStatus) },
    { key: 'last', label: 'Last deployment', value: g => g.lastAt, text: g => awsTime(g.lastAt, false), sort: 'time' },
  ],
  filter: (g, q) => matches(q, g.name, g.lastStatus, g.config),
  active: () => mode.value === 'groups',
  open: g => { group.value = g.name; mode.value = 'deployments'; dt.query.value = ''; deps.load(app.value, g.name, false) },
  openHint: 'deployments',
  back: () => { mode.value = 'apps' },
  keys: () => ({ awsRefresh: { run: () => groups.load(app.value, true) } }),
})

const dt = useAwsTable<CdDeployment>({
  rows: () => deps.data.value || [],
  columns: () => [
    { key: 'id', label: 'Deployment ID', value: d => d.id, flex: true, mono: true },
    { key: 'status', label: 'Status', value: d => d.status, color: d => cdStatusColor(d.status) },
    { key: 'creator', label: 'Creator', value: d => d.creator },
    { key: 'created', label: 'Created', value: d => d.createdAt, text: d => awsTime(d.createdAt, false), sort: 'time' },
    { key: 'completed', label: 'Completed', value: d => d.completedAt, text: d => awsTime(d.completedAt, false), sort: 'time' },
  ],
  filter: (d, q) => matches(q, d.id, d.status, d.creator),
  active: () => mode.value === 'deployments',
  sort: { key: 'created', desc: true },
  open: d => { dep.value = d; mode.value = 'detail' },
  openHint: 'details',
  back: () => { mode.value = 'groups' },
  keys: d => ({
    awsRefresh: { run: () => deps.load(app.value, group.value, true) },
    ...(d ? { awsCopy: { run: () => copyText(d.id) } } : {}),
  }),
})

useAwsKeys(() => (mode.value === 'detail' && dep.value
  ? { keys: { awsBack: { run: () => { mode.value = 'deployments' } }, awsCopy: { run: () => copyText(dep.value!.id), hint: 'copy id' } } }
  : { keys: {} }))

const crumb = computed(() => ['CodeDeploy', app.value, mode.value !== 'groups' ? group.value : '', mode.value === 'detail' ? dep.value?.id : ''].filter(Boolean).join(' › '))

useAwsJump('CodeDeploy', (q) => {
  mode.value = 'apps'
  at.query.value = q
})

onMounted(() => apps.load(false))
</script>

<template>
  <AwsGrid
    v-if="mode === 'apps'"
    :t="at"
    title="CodeDeploy applications"
    :busy="apps.busy.value"
    :error="apps.error.value"
    :at="apps.at.value"
    :waiting="!apps.data.value"
    :row-key="a => a.name"
    empty="No CodeDeploy applications in this region."
    @open="a => { app = a.name; mode = 'groups'; groups.load(a.name, false) }"
    @refresh="apps.load(true)"
  />
  <AwsGrid
    v-else-if="mode === 'groups'"
    :t="gt"
    :title="crumb"
    :busy="groups.busy.value"
    :error="groups.error.value"
    :at="groups.at.value"
    :waiting="!groups.data.value"
    :row-key="g => g.name"
    empty="No deployment groups."
    @open="g => { group = g.name; mode = 'deployments'; deps.load(app, g.name, false) }"
    @refresh="groups.load(app, true)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'apps'" />
    </template>
  </AwsGrid>
  <AwsGrid
    v-else-if="mode === 'deployments'"
    :t="dt"
    :title="crumb"
    :busy="deps.busy.value"
    :error="deps.error.value"
    :at="deps.at.value"
    :waiting="!deps.data.value"
    :row-key="d => d.id"
    empty="No deployments."
    @open="d => { dep = d; mode = 'detail' }"
    @refresh="deps.load(app, group, true)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'groups'" />
    </template>
  </AwsGrid>
  <div v-else-if="dep" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'deployments'" />
      <span class="text-[13px] font-semibold">{{ crumb }}</span>
    </div>
    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Deployment', v: dep.id, mono: true },
          { k: 'Status', v: dep.status, color: cdStatusColor(dep.status) },
          { k: 'Application', v: dep.app },
          { k: 'Group', v: dep.group },
          { k: 'Config', v: dep.config },
          { k: 'Creator', v: dep.creator },
          { k: 'Created', v: awsTime(dep.createdAt) },
          { k: 'Completed', v: awsTime(dep.completedAt) },
          { k: 'Revision', v: dep.revision, mono: true },
          { k: 'Instances', v: `${dep.succeeded} succeeded · ${dep.failed} failed · ${dep.inProgress} in progress · ${dep.pending} pending · ${dep.skipped} skipped` },
          { k: 'Description', v: dep.description },
          ...(dep.errCode ? [{ k: 'Error', v: `${dep.errCode}: ${dep.errMessage}`, color: 'var(--red)' }] : []),
        ]"
      />
    </div>
  </div>
</template>
