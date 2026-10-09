<script setup lang="ts">
// The profile and region pickers, aws-tui's first two screens.
const A = useAwsStore()
</script>

<template>
  <AwsPickProfile v-if="A.picker === 'profile'" />
  <AwsPickRegion v-else />
</template>
