<script setup lang="ts">
// An AWS CLI session in a terminal: an SSM shell, a port forward, aws logs tail, or an SSO sign-in.
// It keeps running when you go back to the services; the sidebar lists it until it's closed.
import { attachTerminal, detachTerminal, focusTerminal } from '~/utils/terminals'

const props = defineProps<{ id: string }>()

const A = useAwsStore()
const prefs = usePrefsStore()
const host = ref<HTMLElement | null>(null)
const t = computed(() => A.terms.find(x => x.id === props.id))

onMounted(() => {
  if (!host.value) return
  attachTerminal(props.id, host.value)
  setTimeout(() => focusTerminal(props.id), 80)
})
onBeforeUnmount(() => { if (host.value) detachTerminal(props.id, host.value) })

const leave = () => { A.term = null }

useAwsKeys(() => ({ keys: { awsBack: { run: leave }, awsDetach: { run: leave, hint: 'back, still running' } } }))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln2) px-3">
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-arrow-left-01" :title="`Back, leaving it running (${prefs.kl('awsDetach')})`" @click="leave" />
      <span class="text-[13px] font-semibold">{{ t?.title }}</span>
      <span v-if="t?.exited" class="text-[11.5px] text-(--fa)">ended</span>
      <span v-else class="flex items-center gap-1 text-[11.5px] text-(--grn)"><span class="h-1.5 w-1.5 rounded-full bg-(--grn)" />running</span>
      <span class="mono ellipsis min-w-0 flex-1 select-text text-[11px] text-(--fa)" :title="t?.cmd">{{ t?.cmd }}</span>
      <span class="mono whitespace-nowrap text-[10.5px] text-(--fa)">{{ prefs.kl('awsDetach') }} back</span>
      <UButton size="xs" color="neutral" variant="subtle" :label="t?.exited ? 'Close' : 'End session'" @click="A.closeTerm(id)" />
    </div>
    <div ref="host" class="min-h-0 flex-1 bg-(--term) p-1.5" @mousedown="focusTerminal(id)" />
  </div>
</template>
