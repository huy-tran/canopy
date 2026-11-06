<script setup lang="ts">
// The editor for one SSH profile: connection, login, port forwards and advanced options. Changes save as you type.
// Used by Settings > SSH and by the SSH window.
import type { SshAuth, SshForward, SshHost } from '#shared/types'
import { errMessage } from '#shared/errors'

const props = defineProps<{ id: string }>()
const emit = defineEmits<{ back: []; connect: [id: string] }>()

const prefs = usePrefsStore()

const hosts = computed(() => prefs.prefs.sshHosts || [])
const host = computed(() => hosts.value.find(h => h.id === props.id) || null)
const groupNames = computed(() => sshGroups(hosts.value).map(g => g.group).filter(Boolean))

function patch(id: string, p: Partial<SshHost>) {
  prefs.set({ sshHosts: hosts.value.map(h => (h.id === id ? { ...h, ...p } : h)) })
}

const tab = ref<'general' | 'ports' | 'advanced'>('general')
const AUTH: { label: string; value: SshAuth; title: string }[] = [
  { label: 'Auto', value: 'auto', title: 'ssh tries your keys, the agent, then asks for a password' },
  { label: 'Password', value: 'password', title: 'Log in with a password only' },
  { label: 'Key', value: 'key', title: 'Log in with the private key below' },
  { label: 'Agent', value: 'agent', title: 'Log in with a key held by ssh-agent or Pageant' },
  { label: 'Interactive', value: 'interactive', title: 'Answer the server\'s prompts in the terminal' },
]
const CONNECTION = [
  { label: 'Direct', value: 'direct' },
  { label: 'Via jump host', value: 'jump' },
]
const FORWARD_TYPES: { label: string; value: SshForward['type'] }[] = [
  { label: 'Local', value: 'local' },
  { label: 'Remote', value: 'remote' },
  { label: 'Dynamic', value: 'dynamic' },
]
const TABS = [
  { label: 'General', value: 'general' },
  { label: 'Ports', value: 'ports' },
  { label: 'Advanced', value: 'advanced' },
]

const viaJump = ref(false)
// Password (or key passphrase), kept in the system keychain and never in the saved settings.
const hasPw = ref(false)
const pwOpen = ref(false)
const pwText = ref('')
const pwError = ref('')

watch(() => props.id, (id) => {
  tab.value = 'general'
  viaJump.value = !!host.value?.jump
  pwOpen.value = false
  pwText.value = ''
  pwError.value = ''
  hasPw.value = false
  api.ssh.hasPassword(id).then((v) => { if (props.id === id) hasPw.value = !!v }).catch(() => {})
}, { immediate: true })

const auth = computed({
  get: () => host.value?.auth || 'auto',
  set: (v: SshAuth) => host.value && patch(host.value.id, { auth: v }),
})
const connection = computed({
  get: () => (viaJump.value ? 'jump' : 'direct'),
  set: (v: string) => {
    viaJump.value = v === 'jump'
    if (!viaJump.value && host.value) patch(host.value.id, { jump: undefined })
  },
})
const tabModel = computed({ get: () => tab.value, set: (v: 'general' | 'ports' | 'advanced') => { tab.value = v } })

function setPort(v: string | number) {
  if (!host.value) return
  const n = Number(String(v).replace(/[^0-9]/g, ''))
  patch(host.value.id, { port: n > 0 && n < 65536 ? n : undefined })
}
function setText(k: 'host' | 'user' | 'identity' | 'jump' | 'command', v: string | number) {
  if (host.value) patch(host.value.id, { [k]: String(v).trim() || undefined })
}
/** The name keeps its spaces while typing; the other fields are trimmed. */
function setName(v: string | number) {
  if (host.value) patch(host.value.id, { name: String(v) })
}
/** Picks an existing group or names a new one; empty means no group. */
function setGroup(g?: string | null) {
  if (host.value) patch(host.value.id, { group: String(g || '').trim() || undefined })
}

async function browseKey() {
  const f = await api.ssh.pickKey()
  if (f && host.value) patch(host.value.id, { identity: f })
}

async function savePassword() {
  if (!host.value) return
  try {
    await api.ssh.setPassword(host.value.id, pwText.value)
    hasPw.value = !!pwText.value
    pwOpen.value = false
    pwText.value = ''
    pwError.value = ''
  } catch (e) {
    pwError.value = errMessage(e)
  }
}
async function clearPassword() {
  if (!host.value) return
  await api.ssh.setPassword(host.value.id, null).catch(() => {})
  hasPw.value = false
}

// Port forwards.
function addForward() {
  if (!host.value) return
  const f: SshForward = { id: uid('f'), type: 'local', bindPort: 8080, destHost: 'localhost', destPort: 80 }
  patch(host.value.id, { forwards: [...(host.value.forwards || []), f] })
}
function patchForward(id: string, p: Partial<SshForward>) {
  if (host.value) patch(host.value.id, { forwards: (host.value.forwards || []).map(f => (f.id === id ? { ...f, ...p } : f)) })
}
function removeForward(id: string) {
  if (host.value) patch(host.value.id, { forwards: (host.value.forwards || []).filter(f => f.id !== id) })
}
const num = (v: string | number) => Number(String(v).replace(/[^0-9]/g, '')) || 0

const FIELD = { root: 'w-full', base: 'h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx)' }
const LABEL = 'text-[11.5px] text-(--mu)'
</script>

<template>
  <div v-if="host" class="flex flex-col">
    <div class="mb-3 flex items-center gap-2">
      <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-arrow-left-01" aria-label="Back to profiles" class="flex-none" @click="emit('back')" />
      <div class="ellipsis text-[15px] font-semibold">{{ host.name || 'Profile' }}</div>
      <div class="flex-1" />
      <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-play" label="Connect" class="h-[26px] font-normal" @click="emit('connect', host.id)" />
    </div>

    <div class="mb-3 grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1"><span :class="LABEL">Name</span>
        <UInput :model-value="host.name" variant="none" :ui="FIELD" @update:model-value="setName" />
      </label>
      <div class="flex flex-col gap-1"><span :class="LABEL">Group</span>
        <USelectMenu
          :model-value="host.group || undefined"
          :items="groupNames"
          :create-item="{ when: 'always', position: 'top' }"
          clear
          placeholder="No group"
          :search-input="{ placeholder: 'Search or create a group' }"
          :ui="{ base: 'h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx) ring-0', content: 'bg-(--modal) ring-0 border border-(--bb) rounded-lg', item: 'text-[12.5px]' }"
          @create="(g: string) => setGroup(g)"
          @update:model-value="(g: string | null) => setGroup(g)"
        />
      </div>
    </div>

    <Seg v-model="tabModel" :items="TABS" size="lg" class="mb-3 self-start" />

    <!-- General -->
    <div v-if="tab === 'general'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <span :class="LABEL">Connection</span>
        <Seg v-model="connection" :items="CONNECTION" size="lg" class="self-start" />
      </div>
      <label v-if="viaJump" class="flex flex-col gap-1"><span :class="LABEL">Jump host</span>
        <UInput :model-value="host.jump || ''" placeholder="user@bastion, or a Host from ~/.ssh/config" variant="none" :ui="FIELD" @update:model-value="v => setText('jump', v)" />
      </label>
      <div class="grid grid-cols-[1fr_100px] gap-3">
        <label class="flex flex-col gap-1"><span :class="LABEL">Host</span>
          <UInput :model-value="host.host" placeholder="example.com, an IP, or a Host from ~/.ssh/config" variant="none" :ui="FIELD" @update:model-value="v => setText('host', v)" />
        </label>
        <label class="flex flex-col gap-1"><span :class="LABEL">Port</span>
          <UInput :model-value="host.port ? String(host.port) : ''" placeholder="22" variant="none" inputmode="numeric" :ui="FIELD" @update:model-value="setPort" />
        </label>
      </div>
      <label class="flex flex-col gap-1"><span :class="LABEL">Username</span>
        <UInput :model-value="host.user || ''" placeholder="Your local user name when empty" variant="none" :ui="FIELD" @update:model-value="v => setText('user', v)" />
      </label>

      <div class="flex flex-col gap-1">
        <span :class="LABEL">Authentication method</span>
        <Seg v-model="auth" :items="AUTH" size="lg" class="self-start" />
      </div>

      <div v-if="auth === 'password' || auth === 'key'" class="flex flex-col gap-1.5">
        <div class="flex items-center gap-3">
          <div class="flex flex-1 flex-col gap-[2px]">
            <span :class="LABEL">{{ auth === 'password' ? 'Password' : 'Key passphrase' }}</span>
            <span class="text-[11px] text-(--fa)">{{ hasPw ? 'Saved in the system keychain and typed in for you.' : 'Not saved: ssh asks for it in the terminal.' }}</span>
          </div>
          <UButton v-if="hasPw" color="neutral" variant="ghost" size="xs" label="Remove" class="h-[26px] font-normal" @click="clearPassword" />
          <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-key-01" :label="hasPw ? 'Change' : auth === 'password' ? 'Set password' : 'Set passphrase'" class="h-[26px] font-normal" @click="pwOpen = !pwOpen" />
        </div>
        <div v-if="pwOpen" class="flex items-center gap-2">
          <UInput v-model="pwText" type="password" autofocus placeholder="Type it here" variant="none" :ui="FIELD" @keydown.enter="savePassword" />
          <UButton color="primary" size="xs" label="Save" class="h-[30px] flex-none font-normal" :disabled="!pwText" @click="savePassword" />
        </div>
        <div v-if="pwError" class="text-[11.5px] text-(--red)">{{ pwError }}</div>
      </div>

      <div v-if="auth === 'auto' || auth === 'key'" class="flex flex-col gap-1">
        <span :class="LABEL">Private key</span>
        <div class="flex items-center gap-2">
          <UInput :model-value="host.identity || ''" placeholder="~/.ssh/id_ed25519 (empty uses ssh's defaults)" variant="none" :ui="FIELD" @update:model-value="v => setText('identity', v)" />
          <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-folder-open" label="Browse" class="h-[30px] flex-none font-normal" @click="browseKey" />
        </div>
      </div>
    </div>

    <!-- Ports -->
    <div v-else-if="tab === 'ports'" class="flex flex-col gap-3">
      <div class="text-[12px] leading-[1.5] text-(--mu)">
        Forwards run for as long as this terminal is connected. Local: a port here reaches a host through the server. Remote: a port on the server reaches a host from here. Dynamic: a SOCKS proxy on this computer.
      </div>
      <div v-for="f in host.forwards || []" :key="f.id" class="flex flex-col gap-2 rounded-lg border border-(--ln) p-3">
        <div class="flex items-center gap-2">
          <Seg :model-value="f.type" :items="FORWARD_TYPES" size="lg" @update:model-value="v => patchForward(f.id, { type: v })" />
          <div class="flex-1" />
          <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-delete-02" aria-label="Remove forward" class="text-(--mu) hover:text-(--red)" @click="removeForward(f.id)" />
        </div>
        <div class="grid items-end gap-2" :class="f.type === 'dynamic' ? 'grid-cols-[1fr_100px]' : 'grid-cols-[1fr_90px_1fr_90px]'">
          <label class="flex flex-col gap-1"><span :class="LABEL">{{ f.type === 'remote' ? 'Server listens on' : 'Listen on' }}</span>
            <UInput :model-value="f.bindHost || ''" placeholder="localhost" variant="none" :ui="FIELD" @update:model-value="v => patchForward(f.id, { bindHost: String(v).trim() || undefined })" />
          </label>
          <label class="flex flex-col gap-1"><span :class="LABEL">Port</span>
            <UInput :model-value="f.bindPort ? String(f.bindPort) : ''" inputmode="numeric" variant="none" :ui="FIELD" @update:model-value="v => patchForward(f.id, { bindPort: num(v) })" />
          </label>
          <template v-if="f.type !== 'dynamic'">
            <label class="flex flex-col gap-1"><span :class="LABEL">Destination</span>
              <UInput :model-value="f.destHost || ''" placeholder="localhost" variant="none" :ui="FIELD" @update:model-value="v => patchForward(f.id, { destHost: String(v).trim() })" />
            </label>
            <label class="flex flex-col gap-1"><span :class="LABEL">Port</span>
              <UInput :model-value="f.destPort ? String(f.destPort) : ''" inputmode="numeric" variant="none" :ui="FIELD" @update:model-value="v => patchForward(f.id, { destPort: num(v) })" />
            </label>
          </template>
        </div>
      </div>
      <div><UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-add-01" label="Add forward" class="h-[28px] font-normal" @click="addForward" /></div>
    </div>

    <!-- Advanced -->
    <div v-else class="flex flex-col gap-3">
      <label class="flex flex-col gap-1"><span :class="LABEL">Run on connect</span>
        <UInput :model-value="host.command || ''" placeholder="e.g. cd /var/www && exec $SHELL -l" variant="none" :ui="FIELD" @update:model-value="v => setText('command', v)" />
        <span class="text-[11px] text-(--fa)">Runs on the server instead of the usual login shell.</span>
      </label>
      <div class="flex items-center gap-4 border-t border-(--ln2) pt-3">
        <div class="flex flex-1 flex-col gap-[3px]">
          <span class="text-[12.5px] text-(--tx)">Reconnect when the connection drops</span>
          <span class="text-[11.5px] text-(--mu)">Tries again up to 5 times, 3 seconds apart. Typing exit does not reconnect.</span>
        </div>
        <USwitch :model-value="!!host.reconnect" @update:model-value="v => patch(host!.id, { reconnect: !!v })" />
      </div>
    </div>
  </div>
</template>
