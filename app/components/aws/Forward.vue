<script setup lang="ts">
// Port forwarding through SSM, from an EC2 instance itself or on to a host behind it (a database,
// say). Runs aws ssm start-session in a terminal that keeps going while you use the window.
import type { Ec2Instance } from '#shared/aws'

const props = defineProps<{ instance: Ec2Instance; remoteHost?: string; remotePort?: number; localPort?: number }>()
const emit = defineEmits<{ close: [] }>()

const A = useAwsStore()
const remote = ref(props.remotePort ? String(props.remotePort) : '')
const local = ref(props.localPort ? String(props.localPort) : '')
const host = ref(props.remoteHost || '')
const first = ref<HTMLInputElement | null>(null)
const error = ref('')

const port = (s: string) => {
  const n = Number(s)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : 0
}

function start() {
  const rp = port(remote.value)
  const lp = local.value.trim() ? port(local.value) : rp
  if (!rp) return (error.value = 'The remote port has to be 1 to 65535.')
  if (!lp) return (error.value = 'The local port has to be 1 to 65535.')
  const i = props.instance
  A.openTerm('forward', `localhost:${lp} → ${host.value.trim() || i.name || i.id}:${rp}`, { instance: i.id, remotePort: rp, localPort: lp, host: host.value.trim() || undefined })
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    start()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    focusAwsWindow()
  }
}

useAwsKeys(() => ({ modal: true, keys: { awsBack: { run: () => emit('close') }, awsOpen: { run: start, hint: 'start' } } }))
onMounted(() => nextTick(() => first.value?.focus()))
</script>

<template>
  <AwsDialog title="Port forward" :sub="`through ${instance.name || instance.id}`" width="480px" @close="emit('close')">
    <div class="flex flex-col gap-3 px-5 py-4" @keydown="onKey">
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[110px] text-(--mu)">Remote port</span>
        <input ref="first" v-model="remote" inputmode="numeric" placeholder="5432" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
      </label>
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[110px] text-(--mu)">Local port</span>
        <input v-model="local" inputmode="numeric" :placeholder="remote || 'same as remote'" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
      </label>
      <label class="flex items-center gap-3 text-[12.5px]">
        <span class="w-[110px] text-(--mu)">Remote host</span>
        <input v-model="host" placeholder="optional: a host the instance can reach" class="mono h-[30px] flex-1 rounded-md border border-(--ln) bg-(--inp) px-2.5 text-[12.5px] text-(--tx) outline-none focus:border-(--lnk)">
      </label>
      <span v-if="error" class="text-[12px] text-(--red)">{{ error }}</span>
      <div class="flex justify-end gap-2">
        <UButton size="sm" color="neutral" variant="outline" label="Cancel" @click="emit('close')" />
        <UButton size="sm" color="primary" label="Start" @click="start" />
      </div>
    </div>
  </AwsDialog>
</template>
