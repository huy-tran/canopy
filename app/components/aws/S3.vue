<script setup lang="ts">
// S3: buckets (each reached in its own region), browsing one folder by folder, downloading a file,
// uploading files into the folder showing (asking before overwriting any), and deleting the files
// picked with Space. Deletes and uploads go in the audit log, and only there in dry-run.
import type { S3Bucket, S3Entry } from '#shared/aws'

const A = useAwsStore()
const ui = useUiStore()

const buckets = useAwsLoad((ctx, force: boolean) => api.aws.s3Buckets(ctx, force))
const objects = useAwsLoad((ctx, b: string, region: string, prefix: string, force: boolean) => api.aws.s3List(ctx, b, region, prefix, force))
const bucket = ref<S3Bucket | null>(null)
const prefix = ref('')
const picked = ref<Set<string>>(new Set())
const uploading = ref<{ name: string; key: string; size: number; state: 'waiting' | 'sending' | 'done' | 'failed'; error?: string }[] | null>(null)

const regionUrl = (b: S3Bucket) => `https://${b.name}.s3.${b.region || A.region}.amazonaws.com/`

const bt = useAwsTable<S3Bucket>({
  rows: () => buckets.data.value || [],
  columns: () => [
    { key: 'name', label: 'Bucket', value: b => b.name, flex: true },
    { key: 'region', label: 'Region', value: b => b.region || '…', mono: true },
    { key: 'created', label: 'Created', value: b => b.createdAt, text: b => awsDate(b.createdAt), sort: 'time' },
  ],
  filter: (b, q) => matches(q, b.name),
  active: () => !bucket.value,
  open: b => browse(b, ''),
  openHint: 'browse',
  keys: b => ({
    awsRefresh: { run: () => buckets.load(true) },
    ...(b ? {
      awsBookmark: { run: () => A.toggleBookmark('S3', b.name, b.name) },
      awsRelated: { run: () => A.related(s3Links(b)), hint: 'related' },
      awsCopy: { run: () => A.choose('Copy', [
        { key: 'b', label: 'bucket', run: () => copyText(b.name) },
        { key: 'u', label: 's3:// URI', run: () => copyText(`s3://${b.name}/`) },
        { key: 'h', label: 'https URL', run: () => copyText(regionUrl(b)) },
      ]) },
    } : {}),
  }),
})

function browse(b: S3Bucket, p: string) {
  bucket.value = b
  prefix.value = p
  picked.value = new Set()
  ot.query.value = ''
  objects.load(b.name, b.region, p, false)
}

const name = (e: S3Entry) => e.key.slice(prefix.value.length) || e.key

const ot = useAwsTable<S3Entry>({
  rows: () => objects.data.value?.entries || [],
  columns: () => [
    { key: 'name', label: 'Name', value: e => name(e), flex: true },
    { key: 'size', label: 'Size', value: e => e.size, text: e => (e.folder ? '<prefix>' : bytes(e.size)), sort: 'num', align: 'right' },
    { key: 'modified', label: 'Modified', value: e => e.modifiedAt, text: e => (e.folder ? '' : awsTime(e.modifiedAt, false)), sort: 'time' },
  ],
  filter: (e, q) => matches(q, name(e)),
  active: () => !!bucket.value && !uploading.value,
  open: e => (e.folder ? browse(bucket.value!, e.key) : download(e)),
  openHint: 'open',
  back: up,
  keys: e => ({
    awsRefresh: { run: refresh },
    awsS3Upload: { run: upload, hint: 'upload' },
    ...(picked.value.size || (e && !e.folder) ? { awsS3Delete: { run: () => remove(e) } } : {}),
    ...(e ? {
      awsS3Select: { run: () => toggle(e), hint: 'select' },
      awsCopy: { run: () => copyMenu(e) },
    } : {}),
  }),
})

/** Up a folder, or back to the buckets from the top. */
function up() {
  const b = bucket.value
  if (!b) return
  if (!prefix.value) {
    bucket.value = null
    return
  }
  const parts = prefix.value.replace(/\/$/, '').split('/')
  parts.pop()
  browse(b, parts.length ? `${parts.join('/')}/` : '')
}

function refresh() {
  const b = bucket.value
  if (b) objects.load(b.name, b.region, prefix.value, true)
}

function toggle(e: S3Entry) {
  if (e.folder) return
  const s = new Set(picked.value)
  if (s.has(e.key)) s.delete(e.key)
  else s.add(e.key)
  picked.value = s
  ot.move(1)
}

function copyMenu(e: S3Entry) {
  const b = bucket.value!
  A.choose('Copy', [
    { key: 'u', label: 's3:// URI', run: () => copyText(`s3://${b.name}/${e.key}`) },
    { key: 'h', label: 'https URL', run: () => copyText(`${regionUrl(b)}${e.key.split('/').map(encodeURIComponent).join('/')}`) },
    { key: 'k', label: 'key', run: () => copyText(e.key) },
    { key: 'b', label: 'bucket', run: () => copyText(b.name) },
  ])
}

async function download(e: S3Entry) {
  const b = bucket.value!
  const r = await A.call(api.aws.s3Download(A.c(), b.name, b.region, e.key))
  if (!r.ok) ui.toast({ title: `Could not download ${name(e)}`, body: r.error, error: true })
  else if (r.data) ui.toast({ title: 'Downloaded', body: r.data })
}

/** Deletes the picked files, or the one selected, after asking. */
function remove(e?: S3Entry) {
  const b = bucket.value!
  const keys = picked.value.size ? [...picked.value] : e && !e.folder ? [e.key] : []
  if (!keys.length) return
  A.confirm({
    title: keys.length > 1 ? `Delete ${keys.length} objects?` : `Delete ${keys[0]!.split('/').pop()}?`,
    body: `From s3://${b.name}/. This can't be undone unless the bucket keeps versions.`,
    lines: keys.length > 1 ? keys : undefined,
    ok: 'Delete',
    run: async () => {
      const r = await api.aws.s3Delete(A.c(), b.name, b.region, keys)
      if (A.done(r, keys.length > 1 ? `Deleted ${keys.length} objects` : `Deleted ${keys[0]}`)) {
        picked.value = new Set()
        refresh()
      }
    },
  })
}

/** Picks files, asks before overwriting any that are there already, then sends them one at a time. */
async function upload() {
  const b = bucket.value!
  const files = await api.aws.s3PickUpload()
  if (!files.length) return
  const queue = files.map(f => ({ path: f.path, name: f.path.split(/[\\/]/).pop()!, size: f.size, key: `${prefix.value}${f.path.split(/[\\/]/).pop()}` }))
  const existing = await A.call(api.aws.s3Existing(A.c(), b.name, b.region, queue.map(q => q.key)))
  const go = async () => {
    uploading.value = queue.map(q => ({ name: q.name, key: q.key, size: q.size, state: 'waiting' as const }))
    for (const [i, q] of queue.entries()) {
      uploading.value[i]!.state = 'sending'
      const r = await api.aws.s3Upload(A.c(), b.name, b.region, q.path, q.key)
      uploading.value[i]!.state = r.ok ? 'done' : 'failed'
      if (!r.ok) uploading.value[i]!.error = r.error
      if (r.dryRun) uploading.value[i]!.error = 'dry run: only logged'
    }
  }
  if (existing.ok && existing.data.length) {
    A.confirm({ title: 'Overwrite these?', body: `${existing.data.length} of the files are already in s3://${b.name}/${prefix.value}`, lines: existing.data, ok: 'Overwrite all', run: go })
  } else go()
}

function closeUpload() {
  uploading.value = null
  refresh()
}

const upCount = (state: 'done' | 'failed') => (uploading.value || []).filter(u => u.state === state).length
const upDone = computed(() => uploading.value?.every(u => u.state === 'done' || u.state === 'failed'))
useAwsKeys(() => (uploading.value ? { modal: true, keys: upDone.value ? { awsBack: { run: closeUpload }, awsOpen: { run: closeUpload, hint: 'close' } } : {} } : { keys: {} }))

useAwsJump('S3', (q) => {
  bucket.value = null
  bt.query.value = q
})

onMounted(() => buckets.load(false))
</script>

<template>
  <AwsGrid
    v-if="!bucket"
    :t="bt"
    title="S3 buckets"
    :busy="buckets.busy.value"
    :error="buckets.error.value"
    :at="buckets.at.value"
    :waiting="!buckets.data.value"
    :row-key="b => b.name"
    empty="No buckets."
    @open="b => browse(b, '')"
    @refresh="buckets.load(true)"
  />
  <AwsGrid
    v-else
    :t="ot"
    :title="`s3://${bucket?.name}/${prefix}`"
    :sub="objects.data.value?.truncated ? 'the first 1000 entries; narrow the prefix to see the rest' : picked.size ? `${picked.size} selected` : ''"
    :busy="objects.busy.value"
    :error="objects.error.value"
    :at="objects.at.value"
    :waiting="!objects.data.value"
    :row-key="(e: S3Entry) => e.key"
    empty="Empty."
    @open="(e: S3Entry) => (e.folder ? browse(bucket!, e.key) : download(e))"
    @refresh="refresh"
  >
    <template #before>
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" title="Up" @click="up" />
    </template>
    <template #actions>
      <UButton v-if="picked.size" size="xs" color="error" variant="subtle" :label="`Delete ${picked.size}…`" @click="remove()" />
      <UButton size="xs" color="neutral" variant="subtle" icon="i-hugeicons-cloud-upload" label="Upload…" @click="upload" />
    </template>
    <template #cell-name="{ row }">
      <div class="ellipsis" :class="row.folder ? 'text-(--vio)' : ''">
        <span v-if="picked.has(row.key)" class="text-(--grn)">✓ </span>{{ name(row) }}
      </div>
    </template>
  </AwsGrid>

  <AwsDialog v-if="uploading" title="Uploading" :sub="`s3://${bucket?.name}/${prefix}`" width="560px" @close="upDone && closeUpload()">
    <div class="flex min-h-0 flex-1 flex-col gap-1 overflow-auto px-5 py-4 text-[12.5px]">
      <div v-for="u in uploading" :key="u.key" class="flex items-center gap-2">
        <span class="w-4 flex-none" :class="{ 'text-(--grn)': u.state === 'done', 'text-(--red)': u.state === 'failed', 'text-(--amb)': u.state === 'sending', 'text-(--fa)': u.state === 'waiting' }">
          {{ u.state === 'done' ? '✓' : u.state === 'failed' ? '✗' : u.state === 'sending' ? '…' : '·' }}
        </span>
        <span class="ellipsis flex-1">{{ u.name }}</span>
        <span class="mono flex-none text-[11px] text-(--fa)">{{ bytes(u.size) }}</span>
        <span v-if="u.error" class="ellipsis max-w-[45%] flex-none text-[11.5px]" :class="u.state === 'failed' ? 'text-(--red)' : 'text-(--amb)'">{{ u.error }}</span>
      </div>
      <div v-if="upDone" class="mt-3 flex items-center gap-2">
        <span class="text-(--tx2)">Done. {{ upCount('done') }} uploaded, {{ upCount('failed') }} failed.</span>
        <div class="flex-1" />
        <UButton size="sm" color="primary" label="Close" @click="closeUpload" />
      </div>
    </div>
  </AwsDialog>
</template>
