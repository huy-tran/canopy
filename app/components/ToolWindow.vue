<script setup lang="ts">
// What a GitHub, AWS or SSH window shows: that tool, filling the whole window. Only the window for
// this page's kind is loaded.
</script>

<template>
  <div class="flex h-screen min-h-[420px] flex-col overflow-hidden bg-(--modal) text-(--tx)" style="font-size: 12px">
    <LazyGitHubWindow v-if="toolKind === 'gh'" />
    <LazyAwsWindow v-else-if="toolKind === 'aws'" />
    <LazySshWindow v-else-if="toolKind === 'ssh'" />
  </div>
</template>
