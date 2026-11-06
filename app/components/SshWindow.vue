<script setup lang="ts">
// The SSH window, like the GitHub and AWS ones: your profiles on the left (search, then Enter connects),
// the profile editor or a running connection on the right. Connections keep running when you go back
// or close the window; the sidebar lists them until they are ended.
import { useEventListener } from '@vueuse/core'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { SshHost } from '#shared/types'
import { comboOf, matchActions } from '#shared/actions'
import { focusTerminal } from '~/utils/terminals'

const ui = useUiStore()
const prefs = usePrefsStore()
const S = useSessionsStore()

const root = ref<HTMLElement | null>(null)
const search = useTemplateRef<{ inputRef: HTMLInputElement | null }>('search')

/** Showing: the main process says so as the window opens and hides. */
const open = computed(() => ui.ssh)

function focusSearch() {
  nextTick(() => (search.value?.inputRef || root.value)?.focus())
}
/** Ends every connection, after the question that Ctrl+Shift+W raises. */
function closeAllNow() {
  ui.sshAskCloseAll = false
  terms.value.forEach(t => S.close(t.id))
}
// The question takes the keyboard (Enter confirms, Esc cancels) and is dropped when the window closes.
watch(() => ui.sshAskTick, () => { if (ui.sshAskCloseAll) setTimeout(() => root.value?.querySelector<HTMLElement>('[data-close-all]')?.focus(), 30) })
watch(() => ui.ssh, (on) => { if (!on) ui.sshAskCloseAll = false })

watch(open, (on) => { if (on) setTimeout(() => (ui.sshTerm && S.byId(ui.sshTerm) ? focusTerminal(ui.sshTerm) : focusSearch()), 80) }, { immediate: true })

// ---------- Profiles ----------

const hosts = computed(() => prefs.prefs.sshHosts || [])
const query = ref('')
const note = ref('')
const shown = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return words.length ? hosts.value.filter(h => words.every(w => `${h.name} ${h.group || ''} ${h.host} ${h.user || ''}`.toLowerCase().includes(w))) : hosts.value
})
const groups = computed(() => sshGroups(shown.value))
/** The profiles connected to last, for quick reconnecting; hidden while searching. */
const showRecent = computed(() => !query.value.trim() && hosts.value.length > 0)
const recent = computed(() => (query.value.trim() ? [] : hosts.value.filter(h => h.lastUsedAt).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).slice(0, 5)))
const flat = computed(() => groups.value.flatMap(g => g.hosts))
/** The row Enter connects: moves with the arrow keys, back to the first match when the search changes. */
const cursor = ref(0)
watch(query, () => { cursor.value = 0 })
watch(() => flat.value.length, (n) => { if (cursor.value >= n) cursor.value = Math.max(0, n - 1) })
const cursorId = computed(() => flat.value[cursor.value]?.id || null)

/** The tab's top edge: its group's colour, solid for the tab in view; green when the profile has no group. */
function tabEdge(t: { id: string; sshId?: string }) {
  const host = hosts.value.find(h => h.id === t.sshId)
  const hue = host ? sshHue(host) : null
  const active = ui.sshTerm === t.id
  if (hue == null) return active ? 'inset 0 2px 0 var(--grn)' : 'none'
  return `inset 0 2px 0 ${active ? pcol(hue) : pcol(hue, 0.4)}`
}

/** A profile row's tint, its group's colour, stronger when selected or under the arrow keys. */
function hostBg(h: SshHost, cursor = false) {
  const hue = sshHue(h)
  return hue == null ? undefined : pcol(hue, ui.sshSel === h.id ? 0.2 : cursor ? 0.14 : 0.07)
}

/** Connections open in this window, newest last. */
const terms = computed(() => S.sessions.filter(s => s.win === 'ssh'))
const termSession = computed(() => (ui.sshTerm ? S.byId(ui.sshTerm) : null))
const selHost = computed(() => (ui.sshSel ? hosts.value.find(h => h.id === ui.sshSel) || null : null))
const liveCount = computed(() => terms.value.filter(s => !s.exited).length)
/** Open connections to each profile, for the dot beside it. */
const openCount = (id: string) => terms.value.filter(s => s.sshId === id && !s.exited).length

function connect(id: string) {
  ui.openSshTerminal(id)
}
function select(id: string) {
  ui.sshSel = id
  ui.sshTerm = null
}
function show(id: string) {
  ui.sshTerm = id
  ui.sshSel = null
}
/** Back to the profiles; the connection stays up. */
function leave() {
  ui.sshTerm = null
  focusSearch()
}
function end(id: string) {
  S.close(id)
}

/** When the tab in view goes (ended here, or the connection closed itself), the neighbour takes its place. */
watch(() => terms.value.map(t => t.id), (ids, old) => {
  if (!ui.sshTerm || ids.includes(ui.sshTerm)) return
  const i = old.indexOf(ui.sshTerm)
  ui.sshTerm = ids[Math.min(Math.max(i, 0), ids.length - 1)] ?? null
  if (!ui.sshTerm) focusSearch()
})

function add(group = '') {
  const h: SshHost = { id: uid('h'), name: 'New profile', host: '', port: 22, auth: 'auto', group: group || undefined }
  prefs.set({ sshHosts: [...hosts.value, h] })
  query.value = ''
  select(h.id)
}

async function importConfig() {
  const found = await api.ssh.importConfig()
  const have = new Set(hosts.value.map(h => h.host))
  const fresh = found.filter(f => !have.has(f.host))
  prefs.set({ sshHosts: [...hosts.value, ...fresh.map(f => ({ ...f, id: uid('h') }))] })
  note.value = found.length ? `Imported ${fresh.length} from ~/.ssh/config${found.length > fresh.length ? ` (${found.length - fresh.length} already here)` : ''}.` : 'No named hosts found in ~/.ssh/config.'
}

/** Importing from Tabby: its config may be locked with a vault passphrase, which is asked for in the main pane. */
const tabby = ref<{ pass: string; wrong: boolean; busy: boolean } | null>(null)
const importItems: DropdownMenuItem[][] = [[
  { label: 'From ~/.ssh/config', icon: 'i-hugeicons-file-import', onSelect: () => importConfig() },
  { label: 'From Tabby…', icon: 'i-hugeicons-download-01', onSelect: () => importTabby() },
  { label: 'From PuTTY', icon: 'i-hugeicons-download-01', onSelect: () => importPutty() },
  { label: 'From a file (Termius CSV, ssh config)…', icon: 'i-hugeicons-file-import', onSelect: () => importFile() },
]]

async function importFile() {
  note.value = ''
  const res = await api.ssh.importFile({ existing: hosts.value.map(h => ({ name: h.name, host: h.host, user: h.user })) })
  if (res.status === 'canceled') return
  if (res.status === 'error') {
    note.value = res.error
    return
  }
  prefs.set({ sshHosts: [...hosts.value, ...res.hosts] })
  const parts = [`Imported ${res.hosts.length} profile${res.hosts.length === 1 ? '' : 's'} from ${res.file}`]
  if (res.duplicates) parts.push(`${res.duplicates} already here`)
  if (res.skipped) parts.push(`${res.skipped} skipped (not SSH, or no valid host)`)
  parts.push('passwords are never read from files, so ssh asks for them')
  note.value = parts.join(', ') + '.'
}

async function importPutty() {
  note.value = ''
  const res = await api.ssh.importPutty({ existing: hosts.value.map(h => ({ name: h.name, host: h.host, user: h.user })) })
  if (res.status === 'error') {
    note.value = res.error
    return
  }
  prefs.set({ sshHosts: [...hosts.value, ...res.hosts] })
  const parts = [`Imported ${res.hosts.length} profile${res.hosts.length === 1 ? '' : 's'} from PuTTY, in the PuTTY group`]
  if (res.duplicates) parts.push(`${res.duplicates} already here`)
  if (res.skipped) parts.push(`${res.skipped} skipped (not SSH, or no host)`)
  if (res.ppk) parts.push(`${res.ppk} use a .ppk key, which ssh cannot read: convert it in PuTTYgen (Conversions, Export OpenSSH key) and pick the file in the profile`)
  note.value = parts.join(', ') + '.'
}

async function importTabby(pass = '') {
  note.value = ''
  if (tabby.value) tabby.value.busy = true
  const res = await api.ssh.importTabby({ passphrase: pass || undefined, existing: hosts.value.map(h => ({ name: h.name, host: h.host, user: h.user })) })
  if (res.status === 'passphrase') {
    tabby.value = { pass: '', wrong: !!res.wrong, busy: false }
    return
  }
  tabby.value = null
  if (res.status === 'error') {
    note.value = res.error
    return
  }
  prefs.set({ sshHosts: [...hosts.value, ...res.hosts] })
  const parts = [`Imported ${res.hosts.length} profile${res.hosts.length === 1 ? '' : 's'} from Tabby`]
  if (res.passwords) parts.push(`${res.passwords} password${res.passwords === 1 ? '' : 's'} saved in the keychain`)
  if (res.duplicates) parts.push(`${res.duplicates} already here`)
  if (res.skipped) parts.push(`${res.skipped} skipped (no host)`)
  note.value = parts.join(', ') + '.'
}

/** Arrows move through the matches, Enter connects to the highlighted one. */
function onSearchKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const n = flat.value.length
    if (n) cursor.value = (cursor.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (cursorId.value) connect(cursorId.value)
  }
}

/** Keeps the highlighted row in view as the arrows move. */
watch(cursor, () => nextTick(() => root.value?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })))

/**
 * Keys are read on the whole page while the window is open. Esc goes back a step instead of closing; only the toggle
 * (or the X) closes the window. Inside a terminal every key goes to the connection except the one that leaves it.
 */
function onKey(e: KeyboardEvent) {
  if (!ui.ssh || ui.confirm || ui.settings || ui.palette || ui.projectModal || ui.lightbox || ui.about || ui.updOpen) return
  const t = e.target as HTMLElement
  const dialog = t.closest('[role="dialog"]')
  if (dialog && !dialog.querySelector('[data-ssh-root]') && !t.closest('[data-ssh-root]')) return
  if (t.closest('.xterm')) {
    if (matchActions(prefs.keys, comboOf(e), 'ssh').includes('sshDetach')) {
      e.preventDefault()
      leave()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (ui.sshAskCloseAll) ui.sshAskCloseAll = false
    else if (tabby.value) tabby.value = null
    else if (query.value) query.value = ''
    else if (ui.sshSel) ui.sshSel = null
    else if (ui.sshTerm) leave()
    else focusSearch()
    return
  }
  if (matchActions(prefs.keys, comboOf(e), 'ssh').includes('sshDetach') && ui.sshTerm) {
    e.preventDefault()
    leave()
  }
}
useEventListener(window, 'keydown', onKey)
</script>

<template>
  <!-- Esc goes back a step instead of closing; the toggle or the window's X hides it. -->
  <div
    ref="root"
    data-ssh-root
    tabindex="-1"
    class="relative flex min-h-0 flex-1 flex-col bg-(--modal) text-(--tx) outline-none"
  >
    <div class="drag flex h-10 flex-none items-center gap-2 border-b border-(--ln) pl-3.5">
      <UIcon name="i-hugeicons-computer-terminal-01" class="size-4 text-(--tx2)" />
      <span class="text-[13px] font-semibold">SSH</span>
      <span v-if="liveCount" class="mono rounded-lg bg-(--chip) px-1.5 text-[10.5px] font-bold text-(--tx2)">{{ liveCount }} connected</span>
      <div class="flex-1" />
      <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('ssh') }} to close</span>
      <ToolControls />
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- Sidebar -->
      <div class="flex w-[270px] flex-none flex-col border-r border-(--ln) bg-(--chrome)">
        <div class="flex flex-col gap-2 p-2.5">
          <UInput
            ref="search"
            v-model="query"
            icon="i-hugeicons-search-01"
            placeholder="Search, then Enter to connect"
            variant="none"
            :ui="{ root: 'w-full', base: 'h-[30px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx)' }"
            @keydown="onSearchKey"
          />
          <div class="flex gap-1.5">
            <UButton color="primary" size="xs" icon="i-hugeicons-add-01" label="New" class="h-[26px] flex-1 justify-center font-normal" @click="add()" />
            <UDropdownMenu :items="importItems" :content="{ align: 'end', sideOffset: 4 }" :ui="{ content: 'w-[200px]' }">
              <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-file-import" label="Import" trailing-icon="i-hugeicons-arrow-down-01" class="h-[26px] flex-1 justify-center font-normal" />
            </UDropdownMenu>
          </div>
          <div v-if="note" class="text-[11px] leading-[1.4] text-(--mu)">{{ note }}</div>
        </div>

        <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
          <div v-if="!hosts.length" class="px-2 py-6 text-center text-[12px] text-(--fa)">No profiles yet. Add one, or import from ~/.ssh/config.</div>
          <div v-else-if="!shown.length" class="px-2 py-6 text-center text-[12px] text-(--fa)">No profile matches "{{ query }}".</div>
          <div v-if="showRecent" class="mt-1 mb-1">
            <div class="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-(--fa) uppercase">
              <UIcon name="i-hugeicons-clock-01" class="size-3" />
              <span class="flex-1">Recent sessions</span>
            </div>
            <div v-if="!recent.length" class="px-2 py-1.5 text-[11.5px] leading-[1.4] text-(--fa)">Profiles you connect to show up here.</div>
            <div
              v-for="h in recent"
              :key="h.id"
              class="group relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 py-[6px] hover:bg-(--hov)"
              :class="ui.sshSel === h.id ? 'bg-(--sel)' : ''"
              :style="{ background: hostBg(h) }"
              @click="select(h.id)"
              @dblclick="connect(h.id)"
            >
              <span v-if="sshHue(h) != null" class="absolute inset-y-0 left-0 w-[3px]" :style="{ background: pcol(sshHue(h)!) }" />
              <span class="h-1.5 w-1.5 flex-none rounded-full" :class="openCount(h.id) ? 'bg-(--grn)' : 'bg-transparent'" />
              <span class="ellipsis text-[12.5px]">{{ h.name }}</span>
              <span class="ellipsis mono min-w-0 flex-1 text-[10.5px] text-(--fa)">{{ sshDetail(h) }}</span>
              <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-play" aria-label="Connect" title="Connect" class="flex-none text-(--mu) opacity-0 group-hover:opacity-100" @click.stop="connect(h.id)" />
            </div>
          </div>
          <div v-for="g in groups" :key="g.group" class="mt-1">
            <div class="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-(--fa) uppercase">
              <span v-if="g.group" class="h-2 w-2 flex-none rounded-xs" :style="{ background: pcol(groupHue(g.group)!) }" />
              <span class="flex-1" :style="g.group ? { color: ptx(groupHue(g.group)!) } : undefined">{{ g.group || 'Profiles' }}</span>
              <span class="mono font-normal">{{ g.hosts.length }}</span>
            </div>
            <div
              v-for="h in g.hosts"
              :key="h.id"
              :data-cursor="cursorId === h.id"
              class="group relative flex cursor-pointer items-center gap-2 overflow-hidden rounded-md px-2 py-[6px] hover:bg-(--hov)"
              :class="ui.sshSel === h.id ? 'bg-(--sel)' : cursorId === h.id ? 'bg-(--hov)' : ''"
              :style="{ background: hostBg(h, cursorId === h.id) }"
              @click="select(h.id)"
              @dblclick="connect(h.id)"
            >
              <span v-if="sshHue(h) != null" class="absolute inset-y-0 left-0 w-[3px]" :style="{ background: pcol(sshHue(h)!) }" />
              <span class="h-1.5 w-1.5 flex-none rounded-full" :class="openCount(h.id) ? 'bg-(--grn)' : 'bg-transparent'" />
              <span class="ellipsis text-[12.5px]">{{ h.name }}</span>
              <span class="ellipsis mono min-w-0 flex-1 text-[10.5px] text-(--fa)">{{ sshDetail(h) }}</span>
              <UButton color="neutral" variant="ghost" size="xs" icon="i-hugeicons-play" aria-label="Connect" title="Connect" class="flex-none text-(--mu) opacity-0 group-hover:opacity-100" @click.stop="connect(h.id)" />
            </div>
          </div>
        </div>
      </div>

      <!-- Main -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <!-- Open connections, as tabs. Alt ] and Alt [ (or Ctrl Tab) switch between them, as with Claude sessions. -->
        <div v-if="terms.length" class="flex h-[34px] flex-none items-end gap-0.5 overflow-hidden border-b border-(--ln2) bg-(--head) px-1.5">
          <div
            v-for="t in terms"
            :key="t.id"
            class="box-border flex h-[30px] min-w-[90px] flex-[0_1_230px] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 pl-2.5 pr-2"
            :style="{
              background: ui.sshTerm === t.id ? 'var(--term)' : 'transparent',
              borderColor: ui.sshTerm === t.id ? 'var(--ln)' : 'transparent',
              boxShadow: tabEdge(t),
            }"
            @click="show(t.id)"
            @auxclick.middle.prevent="end(t.id)"
          >
            <span class="h-[7px] w-[7px] flex-none rounded-full" :class="t.exited ? 'bg-(--idle)' : 'bg-(--grn)'" />
            <span class="ellipsis flex-1 text-[12px]" :style="{ color: ui.sshTerm === t.id ? 'var(--tx)' : 'var(--tx3)' }">{{ t.title }}</span>
            <UTooltip :text="t.exited ? 'Close' : 'End session'">
              <span
                class="grid h-4 w-4 flex-none place-items-center rounded-sm text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
                @click.stop="end(t.id)"
              ><UIcon name="i-hugeicons-cancel-01" class="size-2.5" /></span>
            </UTooltip>
          </div>
        </div>
        <div v-if="tabby" class="grid flex-1 place-items-center px-6">
          <div class="flex w-[420px] max-w-full flex-col gap-3">
            <div class="text-[15px] font-semibold">Import from Tabby</div>
            <div class="text-[12px] leading-[1.5] text-(--mu)">
              Your Tabby config is locked with its vault passphrase. Enter it to read your profiles, groups and saved passwords. It is used on this computer only, to open Tabby's config file, and is not kept.
            </div>
            <UInput
              v-model="tabby.pass"
              type="password"
              autofocus
              placeholder="Tabby vault passphrase"
              variant="none"
              :ui="{ root: 'w-full', base: 'h-[30px] px-[10px] py-0 bg-(--inp) border border-(--ln) rounded-md text-[12.5px] text-(--tx)' }"
              @keydown.enter="importTabby(tabby.pass)"
            />
            <div v-if="tabby.wrong" class="text-[11.5px] text-(--red)">That passphrase did not open it. Try again.</div>
            <div class="flex gap-2">
              <UButton color="primary" size="xs" label="Import" :loading="tabby.busy" :disabled="!tabby.pass || tabby.busy" class="h-[28px] font-normal" @click="importTabby(tabby.pass)" />
              <UButton color="neutral" variant="ghost" size="xs" label="Cancel" class="h-[28px] font-normal" @click="tabby = null" />
            </div>
          </div>
        </div>
        <SshTerminal v-else-if="termSession" :id="termSession.id" :key="termSession.id" @leave="leave" @end="end(termSession.id)" />
        <div v-else-if="selHost" class="min-h-0 flex-1 overflow-auto px-6 pt-5 pb-6">
          <SshEditor :id="selHost.id" @back="ui.sshSel = null" @connect="connect" />
        </div>
        <div v-else class="grid flex-1 place-items-center px-6 text-center">
          <div class="flex max-w-[360px] flex-col items-center gap-2">
            <UIcon name="i-hugeicons-computer-terminal-01" class="size-8 text-(--fa)" />
            <div class="text-[13px] text-(--tx2)">Pick a profile to edit it, or search and press Enter to connect.</div>
            <div class="text-[11.5px] leading-[1.5] text-(--fa)">Connections stay running when you go back or close this window. Double-click a profile to connect.</div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="ui.sshAskCloseAll" class="absolute inset-0 z-10 grid place-items-center bg-black/40" @click.self="ui.sshAskCloseAll = false">
      <div class="flex w-[380px] max-w-[90%] flex-col gap-3 rounded-xl border border-(--bb) bg-(--modal) px-5 pt-5 pb-4 shadow-(--shadow)">
        <div class="flex flex-col gap-1">
          <span class="text-[14px] font-semibold">Close all {{ terms.length }} SSH connection{{ terms.length === 1 ? '' : 's' }}?</span>
          <span class="text-[12.5px] leading-[1.5] text-(--tx3)">Ends every connection open in this window.</span>
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" class="h-[28px] px-3 text-[12px]" label="Cancel" @click="ui.sshAskCloseAll = false" />
          <UButton
            data-close-all
            color="error"
            variant="solid"
            class="h-[28px] rounded-md bg-(--red) px-3 text-[12px] font-semibold text-white hover:bg-(--red) hover:opacity-90"
            label="Close all"
            @click="closeAllNow"
          />
        </div>
      </div>
    </div>
    <div class="mono flex h-7 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-t border-(--ln) px-3.5 text-[10.5px] text-(--fa)">
      <span><span class="text-(--tx2)">↑ ↓</span> move</span>
      <span><span class="text-(--tx2)">Enter</span> connect</span>
      <span><span class="text-(--tx2)">Esc</span> back</span>
      <span><span class="text-(--tx2)">{{ prefs.kl('nextSession') }}</span> next connection</span>
      <span><span class="text-(--tx2)">{{ prefs.kl('closeTerminal') }}</span> end it</span>
      <span><span class="text-(--tx2)">{{ prefs.kl('closeAll') }}</span> end all</span>
      <span><span class="text-(--tx2)">{{ prefs.kl('sshDetach') }}</span> leave a connection running</span>
      <span><span class="text-(--tx2)">{{ prefs.kl('ssh') }}</span> close</span>
      <div class="flex-1" />
      <span class="cursor-pointer hover:text-(--tx2)" @click="ui.openSettings('keys')">change keys</span>
    </div>
  </div>
</template>
