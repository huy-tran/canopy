<script setup lang="ts">
// An SSH connection in a terminal inside the SSH window. It keeps running when you go back to the profiles;
// the sidebar lists it until it is ended.
import { attachTerminal, detachTerminal, focusTerminal, setSeeThrough } from '~/utils/terminals'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ leave: []; end: [] }>()

const ui = useUiStore()
const S = useSessionsStore()
const prefs = usePrefsStore()
const host = ref<HTMLElement | null>(null)
const session = computed(() => S.byId(props.id))
const profile = computed(() => (prefs.prefs.sshHosts || []).find(h => h.id === session.value?.sshId))

// Over the 3D World the window is see-through, so the terminal is drawn clear too.
watch(() => ui.sim, on => setSeeThrough(props.id, on), { immediate: true })

onMounted(() => {
  if (!host.value) return
  attachTerminal(props.id, host.value)
  setTimeout(() => focusTerminal(props.id), 80)
})
onBeforeUnmount(() => {
  setSeeThrough(props.id, false)
  if (host.value) detachTerminal(props.id, host.value)
})
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" :title="`Back, leaving it connected (${prefs.kl('sshDetach')})`" @click="emit('leave')" />
      <span class="ellipsis text-[13px] font-semibold">{{ session?.title }}</span>
      <span v-if="session?.exited" class="text-[11.5px] text-(--fa)">ended</span>
      <span v-else class="flex items-center gap-1 text-[11.5px] text-(--grn)"><span class="h-1.5 w-1.5 rounded-full bg-(--grn)" />connected</span>
      <span v-if="profile" class="mono ellipsis min-w-0 flex-1 select-text text-[11px] text-(--fa)">{{ sshDetail(profile) }}</span>
      <span v-else class="flex-1" />
      <span class="mono whitespace-nowrap text-[10.5px] text-(--fa)">{{ prefs.kl('sshDetach') }} back</span>
      <UButton size="xs" color="neutral" variant="subtle" :label="session?.exited ? 'Close' : 'End session'" @click="emit('end')" />
    </div>
    <div ref="host" class="min-h-0 flex-1 bg-(--term) p-1.5" @mousedown="focusTerminal(id)" />
  </div>
</template>
