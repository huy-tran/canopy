<script setup lang="ts">
// EC2: instances (running ones unless another state is picked), a shell on one through SSM, port
// forwarding, its details and console output, and stopping, starting or rebooting it once its id
// is typed out. Shells and port forwards run in the window's terminals and keep going in the background.
import type { Ec2Instance } from '#shared/aws'
import type { AwsLine } from '~/utils/aws'

const A = useAwsStore()
const AW = useAwsWorldStore()
const ui = useUiStore()

const STATES = ['all', 'running', 'pending', 'stopping', 'stopped', 'shutting-down', 'terminated'] as const
const state = ref<(typeof STATES)[number]>('running')
const mode = ref<'list' | 'details' | 'console'>('list')
const id = ref<string | null>(null)
const inst = computed(() => AW.world?.instances.find(i => i.id === id.value) || null)
const forward = ref<Ec2Instance | null>(null)

const all = computed(() => AW.world?.instances || [])
const running = computed(() => all.value.filter(i => i.state === 'running').length)
const stopped = computed(() => all.value.filter(i => i.state === 'stopped').length)

const t = useAwsTable<Ec2Instance>({
  rows: () => all.value.filter(i => state.value === 'all' || i.state === state.value),
  columns: () => [
    { key: 'name', label: 'Name', value: i => i.name || '-', flex: true },
    { key: 'id', label: 'Instance ID', value: i => i.id, mono: true },
    { key: 'state', label: 'State', value: i => i.state, color: i => ec2StateColor(i.state) },
    { key: 'type', label: 'Type', value: i => i.type, mono: true },
    { key: 'ip', label: 'Private IP', value: i => i.privIp || '-', mono: true },
  ],
  filter: (i, q) => matches(q, i.name, i.id, i.privIp, i.pubIp, ...i.tags.map(x => x.value)),
  active: () => mode.value === 'list' && !forward.value,
  open: shell,
  openHint: 'shell',
  keys: i => ({
    awsEc2State: { run: askState, hint: 'state' },
    awsRefresh: { run: () => AW.read(true) },
    ...(i ? instanceKeys(i) : {}),
  }),
})

/** Keys for one instance, on the list and in its details. */
function instanceKeys(i: Ec2Instance) {
  return {
    awsEc2Details: { run: () => show(i, 'details'), hint: 'details' },
    awsEc2Console: { run: () => show(i, 'console'), hint: 'console' },
    awsEc2Forward: { run: () => startForward(i), hint: 'port forward' },
    awsEc2Stop: { run: () => power(i, 'stop') },
    awsEc2Start: { run: () => power(i, 'start') },
    awsEc2Reboot: { run: () => power(i, 'reboot') },
    awsBookmark: { run: () => A.toggleBookmark('EC2', i.id, `${i.name || i.id} (${i.id})`) },
    awsRelated: { run: () => A.related(ec2Links(i)), hint: 'related' },
    awsCopy: { run: () => copyMenu(i) },
  }
}

function askState() {
  A.choose('State', STATES.map((s, k) => ({ key: String(k + 1), alt: s[0], label: s, run: () => { state.value = s } })))
}

function copyMenu(i: Ec2Instance) {
  A.choose('Copy', [
    { key: 'i', label: 'instance id', run: () => copyText(i.id) },
    { key: 'p', label: 'private IP', run: () => copyText(i.privIp) },
    { key: 'd', label: 'public DNS', run: () => copyText(i.pubDns || i.pubIp) },
  ])
}

function show(i: Ec2Instance, m: 'details' | 'console') {
  id.value = i.id
  mode.value = m
  if (m === 'console') readConsole(false)
}

function shell(i: Ec2Instance) {
  if (i.state !== 'running') return ui.toast({ title: `${i.name || i.id} isn't running`, body: 'A shell needs a running instance.' })
  A.openTerm('shell', `Shell · ${i.name || i.id}`, { instance: i.id })
}

function startForward(i: Ec2Instance) {
  if (i.state !== 'running') return ui.toast({ title: `${i.name || i.id} isn't running`, body: 'Port forwarding needs a running instance.' })
  forward.value = i
}

/** Stop, start or reboot, once the instance id is typed out. */
function power(i: Ec2Instance, what: 'stop' | 'start' | 'reboot') {
  A.confirm({
    title: `${what[0]!.toUpperCase()}${what.slice(1)} ${i.name || i.id}?`,
    body: `${i.id}${i.name ? ` (${i.name})` : ''} is ${i.state}.`,
    typed: i.id,
    ok: what[0]!.toUpperCase() + what.slice(1),
    run: async () => {
      const r = await api.aws.ec2Power(A.c(), i.id, what, i.name, i.state)
      if (A.done(r, `${what[0]!.toUpperCase()}${what.slice(1)} requested for ${i.name || i.id}`, i.id)) setTimeout(() => AW.read(true), 1500)
    },
  })
}

// ---------- Console output ----------

const consoleText = useAwsLoad((ctx, iid: string, latest: boolean) => api.aws.ec2Console(ctx, iid, latest))
const readConsole = (latest: boolean) => id.value && consoleText.load(id.value, latest)
const consoleLines = computed<AwsLine[]>(() => (consoleText.data.value || '').split(/\r?\n/).map(text => ({ text })))
const lines = ref<{ scroll: (h: any) => void } | null>(null)

const back = () => { mode.value = 'list' }

useAwsKeys(() => (mode.value !== 'list' && inst.value && !forward.value ? {
  keys: {
    awsBack: { run: back },
    ...instanceKeys(inst.value),
    awsRefresh: { run: () => (mode.value === 'console' ? readConsole(true) : AW.read(true)) },
    ...(mode.value === 'console' ? {
      awsCopy: { run: () => copyText(consoleText.data.value || '', 'Console output copied') },
      awsDown: { run: () => lines.value?.scroll('down') },
      awsUp: { run: () => lines.value?.scroll('up') },
      awsPageDown: { run: () => lines.value?.scroll('pageDown') },
      awsPageUp: { run: () => lines.value?.scroll('pageUp') },
      awsTop: { run: () => lines.value?.scroll('top') },
      awsBottom: { run: () => lines.value?.scroll('bottom') },
    } : {}),
  },
} : { keys: {} }))

useAwsJump('EC2', (q) => {
  mode.value = 'list'
  // A jump finds the instance whatever its state.
  state.value = 'all'
  t.query.value = q
})
</script>

<template>
  <AwsGrid
    v-if="mode === 'list'"
    :t="t"
    title="EC2 instances"
    :sub="AW.world ? `${running} running, ${stopped} stopped · state: ${state}` : ''"
    :busy="AW.loading"
    :error="AW.world?.error"
    :at="AW.world?.at"
    :waiting="!AW.world"
    :row-key="i => i.id"
    :dim="i => i.state !== 'running'"
    :empty="state === 'all' ? 'No instances in this region.' : `No ${state} instances. F picks another state.`"
    @open="shell"
    @refresh="AW.read(true)"
  >
    <template #actions>
      <Seg v-model="state" size="sm" :items="[{ label: 'Running', value: 'running' }, { label: 'Stopped', value: 'stopped' }, { label: 'All', value: 'all' }]" />
    </template>
    <template #cell-name="{ row }">
      <div class="ellipsis font-medium">{{ row.name || '-' }}<span v-if="A.isBookmarked('EC2', row.id)" class="ml-1.5 text-(--amb)">★</span></div>
    </template>
  </AwsGrid>

  <div v-else-if="inst" class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Back" @click="back" />
      <span class="text-[13px] font-semibold">{{ inst.name || inst.id }}</span>
      <span class="mono text-[11.5px] text-(--mu)">{{ inst.id }}</span>
      <span class="text-[12px]" :style="{ color: ec2StateColor(inst.state) }">{{ inst.state }}</span>
      <div class="flex-1" />
      <UButton size="xs" color="neutral" variant="subtle" :label="mode === 'console' ? 'Details' : 'Console output'" @click="show(inst, mode === 'console' ? 'details' : 'console')" />
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-plug-01" label="Port forward" :disabled="inst.state !== 'running'" @click="startForward(inst)" />
      <UButton size="xs" color="primary" variant="subtle" icon="i-hugeicons-computer-terminal-01" label="Shell" :disabled="inst.state !== 'running'" @click="shell(inst)" />
    </div>
    <div v-if="mode === 'details'" class="min-h-0 flex-1 overflow-auto px-5 py-4">
      <AwsKv
        :rows="[
          { k: 'Name', v: inst.name },
          { k: 'Instance ID', v: inst.id, mono: true },
          { k: 'State', v: inst.state, color: ec2StateColor(inst.state) },
          { k: 'Type', v: inst.type, mono: true },
          { k: 'Platform', v: inst.platform },
          { k: 'AMI', v: inst.ami, mono: true },
          { k: 'Launched', v: awsTime(inst.launchedAt) },
          { k: 'Private IP', v: inst.privIp, mono: true },
          { k: 'Public IP', v: inst.pubIp, mono: true },
          { k: 'Public DNS', v: inst.pubDns, mono: true },
          { k: 'VPC', v: inst.vpc, mono: true },
          { k: 'Subnet', v: inst.subnet, mono: true },
          { k: 'AZ', v: inst.az },
          { k: 'IAM role', v: inst.iamRole },
          { k: 'Security groups', v: inst.securityGroups.join(', ') },
        ]"
      />
      <div class="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Tags</div>
      <AwsKv :rows="inst.tags.map(x => ({ k: x.key, v: x.value }))" />
      <div class="mt-5 text-[11.5px] text-(--fa)">Y then i, p or d copies the id, private IP or public DNS. Shift+S, Shift+U and Shift+R stop, start and reboot.</div>
    </div>
    <template v-else>
      <div v-if="consoleText.error.value" class="px-4 py-2 text-[12px] text-(--red)">{{ consoleText.error.value }}</div>
      <AwsLines ref="lines" :lines="consoleLines" follow :empty="consoleText.busy.value ? 'Reading the console…' : '(no console output available yet)'" />
    </template>
  </div>

  <AwsForward v-if="forward" :instance="forward" @close="forward = null" />
</template>
