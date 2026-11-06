<script setup lang="ts">
// Saved SSH profiles, in groups. Each opens as a terminal that runs the system ssh, so ~/.ssh/config, keys and ssh-agent all apply.
import type { SshHost } from '#shared/types'

const prefs = usePrefsStore()
const ui = useUiStore()

const hosts = computed(() => prefs.prefs.sshHosts || [])
const query = ref('')
/** Profiles matching the search (name, group, host or user); all of them when it is empty. */
const shown = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.length ? hosts.value.filter(h => words.every(w => `${h.name} ${h.group || ''} ${h.host} ${h.user || ''}`.toLowerCase().includes(w))) : hosts.value
})
const groups = computed(() => sshGroups(shown.value))

function save(list: SshHost[]) {
  prefs.set({ sshHosts: list })
}
function patch(id: string, p: Partial<SshHost>) {
  save(hosts.value.map(h => (h.id === id ? { ...h, ...p } : h)))
}

// ---------- List ----------

const editing = ref<string | null>(null)
const host = computed(() => hosts.value.find(h => h.id === editing.value) || null)
const note = ref('')

function add(group = '') {
  const h: SshHost = { id: uid('h'), name: 'New profile', host: '', port: 22, auth: 'auto', group: group || undefined }
  save([...hosts.value, h])
  edit(h.id)
}

function edit(id: string) {
  editing.value = id
}

function duplicate(h: SshHost) {
  const copy: SshHost = { ...h, id: uid('h'), name: `${h.name} copy`, forwards: (h.forwards || []).map(f => ({ ...f, id: uid('f') })) }
  save([...hosts.value, copy])
}

/** A second click on the same Delete confirms it. */
const confirmId = ref<string | null>(null)
function remove(id: string) {
  if (confirmId.value !== id) {
    confirmId.value = id
    setTimeout(() => { if (confirmId.value === id) confirmId.value = null }, 3000)
    return
  }
  confirmId.value = null
  api.ssh.setPassword(id, null).catch(() => {})
  save(hosts.value.filter(h => h.id !== id))
  if (editing.value === id) editing.value = null
}

function connect(id: string) {
  ui.settings = null
  ui.openShell(null, { ssh: id })
}

async function importConfig() {
  const found = await api.ssh.importConfig()
  const have = new Set(hosts.value.map(h => h.host))
  const fresh = found.filter(f => !have.has(f.host))
  save([...hosts.value, ...fresh.map(f => ({ ...f, id: uid('h') }))])
  note.value = found.length ? `Imported ${fresh.length} from ~/.ssh/config${found.length > fresh.length ? ` (${found.length - fresh.length} already here)` : ''}.` : 'No named hosts found in ~/.ssh/config.'
}

// ---------- Groups ----------

const renaming = ref<string | null>(null)
const renameText = ref('')
function startRename(g: string) {
  renaming.value = g
  renameText.value = g
}
function commitRename() {
  const from = renaming.value
  const to = renameText.value.trim()
  renaming.value = null
  if (from == null || !to || to === from) return
  save(hosts.value.map(h => ((h.group || '') === from ? { ...h, group: to } : h)))
}
const confirmGroup = ref<string | null>(null)
/** Deleting a group keeps its profiles, which move out of any group. */
function ungroup(g: string) {
  if (confirmGroup.value !== g) {
    confirmGroup.value = g
    setTimeout(() => { if (confirmGroup.value === g) confirmGroup.value = null }, 3000)
    return
  }
  confirmGroup.value = null
  save(hosts.value.map(h => ((h.group || '') === g ? { ...h, group: undefined } : h)))
}

const FIELD = { base: 'h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx)' }
</script>

<template>
  <div class="flex flex-col">
    <SshEditor v-if="host" :id="host.id" @back="editing = null" @connect="connect" />

    <!-- List -->
    <template v-else>
      <div class="mb-1 flex items-center gap-2">
        <div class="flex-1 text-[15px] font-semibold">SSH</div>
        <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-file-import" label="Import from ~/.ssh/config" class="h-[26px] font-normal" @click="importConfig" />
        <UButton color="primary" size="xs" icon="i-hugeicons-add-01" label="New profile" class="h-[26px] font-normal" @click="add()" />
      </div>
      <div class="mb-3 text-[12px] leading-[1.5] text-(--mu)">
        Profiles open as terminals using the ssh on this computer, so your ~/.ssh/config, keys and ssh-agent all apply. Connect from the SSH window (the SSH button in the top bar), the command palette, or the + menu in the shell panel.
      </div>
      <div v-if="note" class="mb-3 text-[12px] text-(--tx2)">{{ note }}</div>
      <UInput
        v-if="hosts.length > 1"
        v-model="query"
        icon="i-hugeicons-search-01"
        placeholder="Search profiles by name, group, host or user"
        variant="none"
        class="mb-3"
        :ui="{ root: 'w-full', base: 'h-[30px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx)' }"
      />
      <div v-if="!hosts.length" class="py-6 text-center text-[12px] text-(--fa)">No profiles yet.</div>
      <div v-else-if="!shown.length" class="py-6 text-center text-[12px] text-(--fa)">No profile matches "{{ query }}".</div>

      <div v-for="g in groups" :key="g.group" class="mb-4">
        <div class="mb-1 flex items-center gap-2 border-b border-(--ln2) pb-1">
          <UIcon name="i-hugeicons-folder-01" class="size-3.5 flex-none text-(--mu)" />
          <template v-if="g.group && renaming === g.group">
            <UInput v-model="renameText" autofocus variant="none" :ui="{ root: 'w-[220px]', base: FIELD.base }" @keydown.enter="commitRename" @keydown.esc="renaming = null" @blur="commitRename" />
          </template>
          <span v-else class="text-[12.5px] font-semibold text-(--tx2)">{{ g.group || 'No group' }}</span>
          <span class="mono text-[11px] text-(--fa)">{{ g.hosts.length }}</span>
          <div class="flex-1" />
          <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-add-01" aria-label="New profile in this group" class="text-(--mu)" @click="add(g.group)" />
          <template v-if="g.group">
            <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-edit-02" aria-label="Rename group" class="text-(--mu)" @click="startRename(g.group)" />
            <UButton color="neutral" variant="ghost" size="xs" :label="confirmGroup === g.group ? 'Ungroup its profiles?' : undefined" :icon="confirmGroup === g.group ? undefined : 'i-hugeicons-delete-02'" aria-label="Delete group (keeps its profiles)" class="text-(--mu) hover:text-(--red)" @click="ungroup(g.group)" />
          </template>
        </div>
        <div v-for="h in g.hosts" :key="h.id" class="group flex items-center gap-2 rounded-md px-1 py-[7px] hover:bg-(--hov)">
          <UIcon name="i-hugeicons-computer-terminal-01" class="size-3.5 flex-none text-(--mu)" />
          <button type="button" class="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 text-left" @click="edit(h.id)">
            <span class="ellipsis text-[12.5px] text-(--tx)">{{ h.name }}</span>
            <span class="ellipsis mono text-[11px] text-(--fa)">{{ sshDetail(h) }}</span>
          </button>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-play" aria-label="Connect" class="text-(--mu)" @click="connect(h.id)" />
          <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-edit-02" aria-label="Edit" class="text-(--mu)" @click="edit(h.id)" />
          <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-copy-01" aria-label="Duplicate" class="text-(--mu)" @click="duplicate(h)" />
          <UButton color="neutral" variant="ghost" size="xs" :label="confirmId === h.id ? 'Delete?' : undefined" :icon="confirmId === h.id ? undefined : 'i-hugeicons-delete-02'" aria-label="Delete" class="text-(--mu) hover:text-(--red)" @click="remove(h.id)" />
        </div>
      </div>
    </template>
  </div>
</template>
