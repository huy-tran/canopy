<script setup lang="ts">
// Related resources in other services, when there's more than one to pick from.
import type { AwsLink } from '~/utils/aws'

const A = useAwsStore()

const t = useAwsTable<AwsLink>({
  rows: () => A.links || [],
  columns: () => [
    { key: 'label', label: 'Related', value: l => l.label, flex: true },
    { key: 'tab', label: 'Service', value: l => l.tab },
  ],
  filter: (l, q) => matches(q, l.label, l.tab),
  open: l => A.jumpTo(l.tab, l.query),
  openHint: 'go',
  modal: true,
  back: () => { A.links = null },
})
</script>

<template>
  <AwsDialog title="Related" width="560px" @close="A.links = null">
    <AwsGrid :t="t" title="Related resources" :row-key="l => l.label" class="min-h-[200px]" @open="l => A.jumpTo(l.tab, l.query)" @refresh="() => {}" />
  </AwsDialog>
</template>
