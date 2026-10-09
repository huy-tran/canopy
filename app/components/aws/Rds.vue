<script setup lang="ts">
// RDS: database instances and their details, and a port forward to one through a bastion instance:
// the command copied, as aws-tui does, or started in a terminal here.
import type { RdsInstance } from '#shared/aws'

const A = useAwsStore()
const AW = useAwsWorldStore()

const list = useAwsLoad((ctx, force: boolean) => api.aws.rdsInstances(ctx, force))
const mode = ref<'list' | 'details'>('list')
const id = ref<string | null>(null)
const db = computed(() => list.data.value?.find(d => d.id === id.value) || null)
const fwd = ref<{ db: RdsInstance; bastion: string; remote: string; local: string } | null>(null)
const bastionInput = ref<HTMLInputElement | null>(null)

const t = useAwsTable<RdsInstance>({
  rows: () => list.data.value || [],
  columns: () => [
    { key: 'id', label: 'Identifier', value: d => d.id, flex: true },
    { key: 'engine', label: 'Engine', value: d => `${d.engine} ${d.engineVersion}` },
    { key: 'status', label: 'Status', value: d => d.status, color: d => rdsStatusColor(d.status) },
    { key: 'endpoint', label: 'Endpoint', value: d => d.endpoint || '-', mono: true },
  ],
  filter: (d, q) => matches(q, d.id, d.engine, d.endpoint, d.dbName),
  active: () => mode.value === 'list' && !fwd.value,
  open: d => { id.value = d.id; mode.value = 'details' },
  openHint: 'details',
  keys: d => ({ awsRefresh: { run: () => list.load(true) }, ...(d ? dbKeys(d) : {}) }),
})

function dbKeys(d: RdsInstance) {
  return {
    awsRdsForward: { run: () => askForward(d), hint: 'port forward' },
    awsBookmark: { run: () => A.toggleBookmark('RDS', d.id, d.id) },
    awsRelated: { run: () => A.related(rdsLinks(d)), hint: 'related' },
    awsCopy: { run: () => A.choose('Copy', [
      { key: 'h', label: 'endpoint host', run: () => copyText(d.endpoint) },
      { key: 'p', label: 'port', run: () => copyText(String(d.port)) },
      { key: 'u', label: 'master user', run: () => copyText(d.masterUser) },
    ]) },
  }
}

useAwsKeys(() => (mode.value === 'details' && db.value && !fwd.value
  ? { keys: { awsBack: { run: () => { mode.value = 'list' } }, awsRefresh: { run: () => list.load(true) }, ...dbKeys(db.value) } }
  : { keys: {} }))

function askForward(d: RdsInstance) {
  fwd.value = { db: d, bastion: 'i-', remote: String(d.port || ''), local: String((d.port || 0) + 10000) }
  nextTick(() => bastionInput.value?.focus())
}

const fwdCmd = computed(() => {
  const f = fwd.value
  if (!f) return ''
  const params = JSON.stringify({ host: [f.db.endpoint], portNumber: [f.remote], localPortNumber: [f.local] })
  return `aws ssm start-session --profile ${A.profile} --region ${A.region} --target ${f.bastion} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '${params}'`
})
const fwdOk = computed(() => !!fwd.value && /^i-[0-9a-f]{8,}$/.test(fwd.value.bastion) && Number(fwd.value.remote) > 0 && Number(fwd.value.local) > 0)
const bastions = computed(() => (AW.world?.instances || []).filter(i => i.state === 'running'))

function copyForward() {
  if (!fwdOk.value) return
  copyText(fwdCmd.value, 'Port forward command copied')
  fwd.value = null
  focusAwsWindow()
}

function startForward() {
  const f = fwd.value
  if (!f || !fwdOk.value) return
  A.openTerm('forward', `localhost:${f.local} → ${f.db.id}:${f.remote}`, { instance: f.bastion, host: f.db.endpoint, remotePort: Number(f.remote), localPort: Number(f.local) })
  fwd.value = null
}

function onFwdKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    copyForward()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    fwd.value = null
    focusAwsWindow()
  }
}
useAwsKeys(() => (fwd.value ? { modal: true, keys: { awsBack: { run: () => { fwd.value = null } } } } : { keys: {} }))

useAwsJump('RDS', (q) => {
  mode.value = 'list'
  t.query.value = q
})

onMounted(() => list.load(false))
</script>

<template>
  <AwsGrid
    v-if="mode === 'list'"
    :t="t"
    title="RDS instances"
    :busy="list.busy.value"
    :error="list.error.value"
    :at="list.at.value"
    :waiting="!list.data.value"
    :row-key="d => d.id"
    empty="No database instances in this region."
    @open="d => { id = d.id; mode = 'details' }"
    @refresh="list.load(true)"
  />
  <div v-else-if="db" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="mode = 'list'" />
      <span class="text-[13px] font-semibold">{{ db.id }}</span>
      <span class="text-[12px]" :style="{ color: rdsStatusColor(db.status) }">{{ db.status }}</span>
      <div class="flex-1" />
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-plug-01" label="Port forward…" @click="askForward(db)" />
    </div>
    <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Engine', v: `${db.engine} ${db.engineVersion}` },
          { k: 'Class', v: db.class, mono: true },
          { k: 'Status', v: db.status, color: rdsStatusColor(db.status) },
          { k: 'Multi-AZ', v: db.multiAz ? 'yes' : 'no' },
          { k: 'Endpoint', v: db.endpoint, mono: true },
          { k: 'Port', v: db.port, mono: true },
          { k: 'DB name', v: db.dbName },
          { k: 'Master user', v: db.masterUser },
          { k: 'VPC', v: db.vpc, mono: true },
          { k: 'Subnet group', v: db.subnetGroup },
          { k: 'Security', v: db.securityGroups.join(', '), mono: true },
          { k: 'Storage', v: `${db.allocatedGb} GB ${db.storageType}${db.iops ? ` (iops ${db.iops})` : ''}` },
          { k: 'Created', v: awsTime(db.createdAt) },
        ]"
      />
    </div>
  </div>

  <AwsDialog v-if="fwd" title="Port forward to the database" :sub="`through a bastion · ${fwd.db.id}`" width="620px" @close="fwd = null">
    <div class="flex flex-col gap-3 px-5 py-4" @keydown="onFwdKey">
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[110px] text-(--mu)">Bastion</span>
        <input ref="bastionInput" v-model="fwd.bastion" list="aws-bastions" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
        <datalist id="aws-bastions">
          <option v-for="b in bastions" :key="b.id" :value="b.id">{{ b.name }}</option>
        </datalist>
      </label>
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[110px] text-(--mu)">Remote port</span>
        <input v-model="fwd.remote" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
      </label>
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[110px] text-(--mu)">Local port</span>
        <input v-model="fwd.local" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
      </label>
      <div class="mono select-text break-all rounded-md border border-(--ln) bg-(--inp) px-3 py-2 text-[11px] text-(--tx2)">{{ fwdCmd }}</div>
      <div class="flex items-center justify-end gap-2">
        <span class="mr-auto text-[11.5px] text-(--fa)">Enter copies the command</span>
        <UButton size="sm" color="neutral" variant="outline" icon="i-hugeicons-copy-01" label="Copy" :disabled="!fwdOk" @click="copyForward" />
        <UButton size="sm" color="primary" label="Start here" :disabled="!fwdOk" @click="startForward" />
      </div>
    </div>
  </AwsDialog>
</template>
