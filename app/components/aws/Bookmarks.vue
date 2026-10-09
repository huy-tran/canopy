<script setup lang="ts">
// The profile's bookmarks, shared with aws-tui: Enter jumps to one (switching region if it was
// made in another), d removes it.
import type { AwsBookmark } from '#shared/aws'

const A = useAwsStore()

const t = useAwsTable<AwsBookmark>({
  rows: () => A.bookmarks,
  columns: () => [
    { key: 'tab', label: 'Service', value: b => b.tab },
    { key: 'region', label: 'Region', value: b => b.region, mono: true },
    { key: 'label', label: 'Bookmark', value: b => b.label, flex: true },
  ],
  filter: (b, q) => matches(q, b.tab, b.label, b.id),
  open: b => A.openBookmark(b),
  openHint: 'go',
  modal: true,
  back: () => { A.bookmarksOpen = false },
  keys: b => (b ? { awsBookmarkRemove: { run: () => A.removeBookmark(b), hint: 'remove' } } : {}),
})
</script>

<template>
  <AwsDialog title="Bookmarks" :sub="A.profile" @close="A.bookmarksOpen = false">
    <AwsGrid
      :t="t"
      title="Bookmarks"
      :row-key="b => `${b.tab}|${b.id}`"
      empty="Nothing bookmarked yet. B on a row bookmarks it."
      class="min-h-[320px]"
      @open="b => A.openBookmark(b)"
      @refresh="A.init()"
    />
  </AwsDialog>
</template>
