<script setup lang="ts">
// Picks the AWS profile: every profile in ~/.aws/config and ~/.aws/credentials, the one in use selected.
import type { AwsProfile } from '#shared/aws'

const A = useAwsStore()

const t = useAwsTable<AwsProfile>({
  rows: () => A.profiles,
  columns: () => [
    { key: 'name', label: 'Profile', value: p => p.name, flex: true },
    { key: 'source', label: 'Source', value: p => p.source },
    { key: 'region', label: 'Default region', value: p => p.region || '-', mono: true },
  ],
  filter: (p, q) => matches(q, p.name, p.source, p.region),
  open: p => A.useProfile(p.name),
  openHint: 'use',
  modal: true,
  back: () => { A.picker = null },
})

onMounted(() => {
  const i = t.shown.value.findIndex(p => p.name === A.profile)
  if (i >= 0) t.sel.value = i
})
</script>

<template>
  <AwsDialog title="Profile" sub="from ~/.aws/config and credentials" @close="A.picker = null">
    <AwsGrid
      :t="t"
      title="Profiles"
      :row-key="p => p.name"
      empty="No profiles in ~/.aws. Run aws configure to add one."
      class="min-h-[360px]"
      @open="p => A.useProfile(p.name)"
      @refresh="A.init()"
    >
      <template #cell-name="{ row }">
        <span class="flex items-center gap-2">
          <span class="h-2 w-2 flex-none rounded-full" :style="{ background: profileColor(row.name) }" />
          <span class="ellipsis font-medium">{{ row.name }}</span>
        </span>
      </template>
    </AwsGrid>
  </AwsDialog>
</template>
