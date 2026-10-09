<script setup lang="ts">
// ElastiCache: replication groups and standalone clusters with their pending service updates, an
// update's details with its progress node by node, and applying one once the resource's name is
// typed out. Updates are flagged by how close their apply-by date is.
import type { EcResource, EcServiceUpdate, EcUpdateAction } from '#shared/aws'

const A = useAwsStore()
const ui = useUiStore()

const res = useAwsLoad((ctx, force: boolean) => api.aws.ecResources(ctx, force))
const upd = useAwsLoad((ctx, force: boolean) => api.aws.ecUpdates(ctx, force))
const svc = useAwsLoad((ctx, name: string, force: boolean) => api.aws.ecServiceUpdate(ctx, name, force))

const mode = ref<'list' | 'details' | 'updates' | 'update'>('list')
const resId = ref<string | null>(null)
/** The updates screen: one resource's, or the whole region's. */
const updFor = ref<string | null>(null)
const updKey = ref<string | null>(null)
/** Where the update details came from, for Esc. */
const updFrom = ref<'updates' | 'details'>('updates')

const resource = computed(() => res.data.value?.find(r => r.id === resId.value) || null)
const keyOf = (u: EcUpdateAction) => `${u.serviceUpdate}|${u.resource}`
const update = computed(() => upd.data.value?.find(u => keyOf(u) === updKey.value) || null)

const applicable = (u: EcUpdateAction) => u.status === 'not-applied' || u.status === 'stopped'
const inFlight = (u: EcUpdateAction) => ['waiting-to-start', 'in-progress', 'stopping', 'scheduling', 'scheduled'].includes(u.status)
const withdrawn = (u: EcUpdateAction) => u.serviceUpdateStatus === 'cancelled' || u.serviceUpdateStatus === 'expired'

/** "2 pending (in 12d)" for a resource, coloured by urgency; or in progress; or nothing. */
function pending(id: string) {
  const list = (upd.data.value || []).filter(u => u.resource === id && !withdrawn(u))
  const due = list.filter(applicable)
  if (due.length) {
    const soonest = Math.min(...due.map(u => u.applyBy || Infinity))
    const days = Number.isFinite(soonest) ? Math.ceil((soonest - Date.now()) / 86_400_000) : null
    const when = days === null ? '' : days < 0 ? ' (overdue)' : days === 0 ? ' (today)' : ` (in ${days}d)`
    const hot = days !== null && days < 0 || due.some(u => u.severity === 'critical')
    const warm = days !== null && days <= 14 || due.some(u => u.severity === 'important')
    return { text: `${due.length} pending${when}`, color: hot ? 'var(--red)' : warm ? '#f0883e' : 'var(--amb)' }
  }
  const going = list.filter(inFlight).length
  return going ? { text: `${going} in progress`, color: 'var(--amb)' } : { text: '-', color: 'var(--fa)' }
}

const pendingCount = computed(() => (upd.data.value || []).filter(u => applicable(u) && !withdrawn(u)).length)

const t = useAwsTable<EcResource>({
  rows: () => res.data.value || [],
  columns: () => [
    { key: 'id', label: 'Identifier', value: r => r.id, flex: true },
    { key: 'engine', label: 'Engine', value: r => `${r.engine} ${r.engineVersion}` },
    { key: 'node', label: 'Node type', value: r => r.nodeType, mono: true },
    { key: 'status', label: 'Status', value: r => r.status, color: r => ecStatusColor(r.status) },
    { key: 'updates', label: 'Updates', value: r => pending(r.id).text, color: r => pending(r.id).color },
  ],
  filter: (r, q) => matches(q, r.id, r.engine, r.status, r.nodeType),
  active: () => mode.value === 'list',
  open: r => { resId.value = r.id; mode.value = 'details' },
  openHint: 'details',
  keys: r => ({
    awsRefresh: { run: refresh },
    awsEcAllUpdates: { run: () => showUpdates(null), hint: 'all updates' },
    ...(r ? resKeys(r) : {}),
  }),
})

function resKeys(r: EcResource) {
  return {
    awsEcUpdates: { run: () => showUpdates(r.id), hint: 'updates' },
    awsBookmark: { run: () => A.toggleBookmark('ElastiCache', r.id, r.id) },
    awsCopy: { run: () => A.choose('Copy', [
      { key: 'i', label: 'identifier', run: () => copyText(r.id) },
      { key: 'h', label: 'endpoint host', run: () => copyText(r.endpoint) },
      { key: 'p', label: 'port', run: () => copyText(String(r.port)) },
    ]) },
  }
}

function refresh() {
  res.load(true)
  upd.load(true)
}

function showUpdates(id: string | null) {
  updFor.value = id
  mode.value = 'updates'
  ut.query.value = ''
}

const ut = useAwsTable<EcUpdateAction>({
  rows: () => (upd.data.value || []).filter(u => !updFor.value || u.resource === updFor.value),
  columns: () => [
    { key: 'name', label: 'Service update', value: u => u.serviceUpdate, flex: true, mono: true },
    { key: 'resource', label: 'Resource', value: u => u.resource },
    { key: 'severity', label: 'Severity', value: u => u.severity, color: u => EC_SEV_COLOR[u.severity] },
    { key: 'status', label: 'Status', value: u => u.status },
    { key: 'rec', label: 'Recommended', value: u => (withdrawn(u) ? u.serviceUpdateStatus : applicable(u) ? 'yes' : '-') },
    { key: 'by', label: 'Apply by', value: u => u.applyBy, text: u => (applicable(u) && !withdrawn(u) ? applyByLabel(u.applyBy, ui.now).text : '-'), color: u => (applicable(u) && !withdrawn(u) ? applyByLabel(u.applyBy, ui.now).color : undefined), sort: 'time' },
    { key: 'nodes', label: 'Nodes', value: u => u.nodesUpdated || '-' },
  ],
  filter: (u, q) => matches(q, u.serviceUpdate, u.resource, u.severity, u.status),
  active: () => mode.value === 'updates',
  open: u => openUpdate(u, 'updates'),
  openHint: 'details',
  back: () => { mode.value = updFor.value ? 'details' : 'list' },
  keys: u => ({
    awsRefresh: { run: () => upd.load(true) },
    ...(u ? {
      awsEcApply: { run: () => apply(u), hint: 'apply' },
      awsCopy: { run: () => copyText(u.serviceUpdate) },
    } : {}),
  }),
})

function openUpdate(u: EcUpdateAction, from: 'updates' | 'details') {
  updKey.value = keyOf(u)
  updFrom.value = from
  mode.value = 'update'
  svc.load(u.serviceUpdate, false)
}

/** Applies an update, only while AWS offers it and it hasn't started, once the resource is typed out. */
function apply(u: EcUpdateAction) {
  if (u.serviceUpdateStatus !== 'available') return ui.toast({ title: 'Not available to apply', body: `This service update is ${u.serviceUpdateStatus}.` })
  if (!applicable(u)) return ui.toast({ title: 'Nothing to apply', body: `The update is ${u.status} on ${u.resource}.` })
  A.confirm({
    title: `Apply ${u.serviceUpdate}?`,
    body: `To ${u.resource} (${u.resourceKind}). Nodes restart one at a time, so the cache stays up but may briefly lose connections.${u.estimatedTime ? `\nEstimated time: ${u.estimatedTime}` : ''}`,
    typed: u.resource,
    ok: 'Apply',
    run: async () => {
      const r = await api.aws.ecApply(A.c(), u.serviceUpdate, u.resource, u.resourceKind, u.severity)
      if (A.done(r, `Applying ${u.serviceUpdate}`, u.resource)) upd.load(true)
    },
  })
}

const sv = computed<EcServiceUpdate | null>(() => svc.data.value)
const back = () => {
  if (mode.value === 'update') mode.value = updFrom.value
  else mode.value = 'list'
}

useAwsKeys(() => {
  if (mode.value === 'details' && resource.value) {
    return { keys: { awsBack: { run: back }, awsRefresh: { run: refresh }, ...resKeys(resource.value) } }
  }
  if (mode.value === 'update' && update.value) {
    const u = update.value
    return { keys: { awsBack: { run: back }, awsEcApply: { run: () => apply(u), hint: 'apply' }, awsCopy: { run: () => copyText(u.serviceUpdate) }, awsRefresh: { run: () => { svc.load(u.serviceUpdate, true); upd.load(true) } } } }
  }
  return { keys: {} }
})

useAwsJump('ElastiCache', (q) => {
  mode.value = 'list'
  t.query.value = q
})

onMounted(() => {
  res.load(false)
  upd.load(false)
})
</script>

<template>
  <AwsGrid
    v-if="mode === 'list'"
    :t="t"
    title="ElastiCache"
    :sub="pendingCount ? `${pendingCount} service update${pendingCount > 1 ? 's' : ''} pending` : ''"
    :busy="res.busy.value || upd.busy.value"
    :error="res.error.value || upd.error.value"
    :at="res.at.value"
    :waiting="!res.data.value"
    :row-key="r => r.id"
    empty="No caches in this region."
    @open="r => { resId = r.id; mode = 'details' }"
    @refresh="refresh"
  >
    <template #actions>
      <UButton size="xs" color="neutral" variant="ghost" label="All updates" @click="showUpdates(null)" />
    </template>
  </AwsGrid>

  <AwsGrid
    v-else-if="mode === 'updates'"
    :t="ut"
    :title="updFor ? `Service updates for ${updFor}` : 'Service updates in the region'"
    :busy="upd.busy.value"
    :error="upd.error.value"
    :at="upd.at.value"
    :waiting="!upd.data.value"
    :row-key="keyOf"
    :dim="u => withdrawn(u) || (!applicable(u) && !inFlight(u))"
    empty="No service updates."
    @open="u => openUpdate(u, 'updates')"
    @refresh="upd.load(true)"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = updFor ? 'details' : 'list'" />
    </template>
  </AwsGrid>

  <div v-else-if="mode === 'details' && resource" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="back" />
      <span class="text-[13px] font-semibold">{{ resource.id }}</span>
      <span class="text-[12px]" :style="{ color: ecStatusColor(resource.status) }">{{ resource.status }}</span>
      <div class="flex-1" />
      <UButton size="xs" color="neutral" variant="subtle" label="Service updates" @click="showUpdates(resource.id)" />
    </div>
    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Kind', v: resource.kind },
          { k: 'Engine', v: `${resource.engine} ${resource.engineVersion}` },
          { k: 'Node type', v: resource.nodeType, mono: true },
          { k: 'Status', v: resource.status, color: ecStatusColor(resource.status) },
          { k: 'Endpoint', v: resource.endpoint, mono: true },
          { k: 'Port', v: resource.port, mono: true },
          { k: 'Nodes', v: resource.nodes },
          ...(resource.kind === 'replication-group' ? [
            { k: 'Shards', v: resource.shards },
            { k: 'Cluster mode', v: resource.clusterMode },
            { k: 'Multi-AZ', v: resource.multiAz },
            { k: 'Auto failover', v: resource.autoFailover },
            { k: 'Members', v: resource.members.join(', '), mono: true },
            { k: 'Description', v: resource.description },
          ] : []),
          { k: 'Updates', v: pending(resource.id).text, color: pending(resource.id).color },
        ]"
      />
    </div>
  </div>

  <div v-else-if="mode === 'update' && update" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="back" />
      <span class="mono text-[13px] font-semibold">{{ update.serviceUpdate }}</span>
      <span class="text-[12px] text-(--mu)">on {{ update.resource }}</span>
      <div class="flex-1" />
      <UButton size="xs" color="primary" variant="subtle" label="Apply…" :disabled="!applicable(update) || update.serviceUpdateStatus !== 'available'" @click="apply(update)" />
    </div>
    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Resource', v: `${update.resource} (${update.resourceKind})` },
          { k: 'Engine', v: update.engine },
          { k: 'Severity', v: update.severity, color: EC_SEV_COLOR[update.severity] },
          { k: 'Type', v: update.type },
          { k: 'Status', v: update.serviceUpdateStatus },
          { k: 'Recommended', v: withdrawn(update) ? update.serviceUpdateStatus : applicable(update) ? 'yes' : '-' },
          { k: 'Update status', v: update.status },
          { k: 'Released', v: awsDate(update.releasedAt) },
          { k: 'Apply by', v: applyByLabel(update.applyBy, ui.now).text, color: applyByLabel(update.applyBy, ui.now).color },
          { k: 'Available since', v: awsDate(update.availableAt) },
          { k: 'Status changed', v: awsTime(update.statusChangedAt) },
          { k: 'Nodes updated', v: update.nodesUpdated },
          { k: 'Estimated time', v: update.estimatedTime },
          { k: 'SLA met', v: update.slaMet },
          ...(sv ? [
            { k: 'Target version', v: sv.engineVersion },
            { k: 'Expires', v: awsDate(sv.endsAt) },
            { k: 'Auto-applies', v: sv.autoUpdate ? 'yes, after the apply-by date' : 'no' },
          ] : []),
        ]"
      />
      <p v-if="sv?.description" class="mt-4 max-w-[760px] select-text whitespace-pre-line text-[12.5px] leading-[1.55] text-(--tx2)">{{ sv.description }}</p>
      <template v-if="update.nodes.length">
        <div class="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Nodes</div>
        <AwsKv :rows="update.nodes.map(n => ({ k: n.node, v: `${n.status}${n.startedAt ? ` · started ${awsTime(n.startedAt, false)}` : ''}${n.endedAt ? ` · ended ${awsTime(n.endedAt, false)}` : ''}`, mono: true }))" />
      </template>
    </div>
  </div>
</template>
