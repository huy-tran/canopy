<script setup lang="ts">
// The SSH window, like the GitHub and AWS ones: your profiles on the left (search, then Enter connects),
// the profile editor or a running connection on the right. Connections keep running when you go back
// or close the window; the sidebar lists them until they are ended.
import { useEventListener } from '@vueuse/core'
import type { SshHost } from '#shared/types'
import { comboOf, matchActions } from '#shared/actions'
import { focusTerminal } from '~/utils/terminals'
import { simGlassOf } from '~/stores/prefs'

const ui = useUiStore()
const prefs = usePrefsStore()
const S = useSessionsStore()

const root = ref<HTMLElement | null>(null)
const search = useTemplateRef<{ inputRef: HTMLInputElement | null }>('search')
const glass = computed(() => simGlassOf(prefs.prefs))

const open = computed({
  get: () => ui.ssh,
  set: (v: boolean) => {
    if (!v) {
      ui.ssh = false
      ui.focusLater()
    }
  },
})

function focusSearch() {
  nextTick(() => (search.value?.inputRef || root.value)?.focus())
}
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
const flat = computed(() => groups.value.flatMap(g => g.hosts))
/** The row Enter connects: moves with the arrow keys, back to the first match when the search changes. */
const cursor = ref(0)
watch(query, () => { cursor.value = 0 })
watch(() => flat.value.length, (n) => { if (cursor.value >= n) cursor.value = Math.max(0, n - 1) })
const cursorId = computed(() => flat.value[cursor.value]?.id || null)

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
  if (ui.sshTerm === id) leave()
}

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
    if (query.value) query.value = ''
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
  <!-- Esc goes back a step instead of closing; the toggle, the X or a click outside closes it. -->
  <UModal
    v-model:open="open"
    :content="{ onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault() }"
    :close="false"
    :ui="{
      overlay: ui.sim ? 'bg-black/10' : 'bg-(--ovl)',
      content: 'flex h-[min(88vh,920px)] w-[min(94vw,1320px)] max-w-none flex-col overflow-hidden bg-transparent border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0',
    }"
  >
    <template #content>
      <div
        ref="root"
        data-ssh-root
        tabindex="-1"
        class="flex min-h-0 flex-1 flex-col text-(--tx) outline-none"
        :class="ui.sim ? 'sim-glass' : 'bg-(--modal)'"
        :style="ui.sim ? { '--glass': glass + '%' } : undefined"
      >
        <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln) pl-3.5 pr-2">
          <UIcon name="i-hugeicons-computer-terminal-01" class="size-4 text-(--tx2)" />
          <span class="text-[13px] font-semibold">SSH</span>
          <span v-if="liveCount" class="mono rounded-lg bg-(--chip) px-1.5 text-[10.5px] font-bold text-(--tx2)">{{ liveCount }} connected</span>
          <div class="flex-1" />
          <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('ssh') }} to close</span>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Close" @click="open = false" />
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
                <UButton color="neutral" variant="outline" size="xs" icon="i-hugeicons-file-import" label="Import" title="Import hosts from ~/.ssh/config" class="h-[26px] flex-1 justify-center font-normal" @click="importConfig" />
              </div>
              <div v-if="note" class="text-[11px] leading-[1.4] text-(--mu)">{{ note }}</div>
            </div>

            <div class="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
              <template v-if="terms.length">
                <div class="px-2 pt-1 pb-1 text-[10.5px] font-semibold tracking-wide text-(--fa) uppercase">Open</div>
                <button
                  v-for="s in terms"
                  :key="s.id"
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[6px] text-left hover:bg-(--hov)"
                  :class="ui.sshTerm === s.id ? 'bg-(--sel)' : ''"
                  @click="show(s.id)"
                >
                  <span class="h-1.5 w-1.5 flex-none rounded-full" :class="s.exited ? 'bg-(--idle)' : 'bg-(--grn)'" />
                  <span class="ellipsis flex-1 text-[12.5px]">{{ s.title }}</span>
                  <span v-if="s.exited" class="text-[10.5px] text-(--fa)">ended</span>
                </button>
              </template>

              <div v-if="!hosts.length" class="px-2 py-6 text-center text-[12px] text-(--fa)">No profiles yet. Add one, or import from ~/.ssh/config.</div>
              <div v-else-if="!shown.length" class="px-2 py-6 text-center text-[12px] text-(--fa)">No profile matches "{{ query }}".</div>
              <div v-for="g in groups" :key="g.group" class="mt-1">
                <div class="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-(--fa) uppercase">
                  <UIcon v-if="g.group" name="i-hugeicons-folder-01" class="size-3" />
                  <span class="flex-1">{{ g.group || 'Profiles' }}</span>
                  <span class="mono font-normal">{{ g.hosts.length }}</span>
                </div>
                <div
                  v-for="h in g.hosts"
                  :key="h.id"
                  :data-cursor="cursorId === h.id"
                  class="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-[6px] hover:bg-(--hov)"
                  :class="ui.sshSel === h.id ? 'bg-(--sel)' : cursorId === h.id ? 'bg-(--hov)' : ''"
                  @click="select(h.id)"
                  @dblclick="connect(h.id)"
                >
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
            <SshTerminal v-if="termSession" :id="termSession.id" :key="termSession.id" @leave="leave" @end="end(termSession.id)" />
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

        <div class="mono flex h-7 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-t border-(--ln) px-3.5 text-[10.5px] text-(--fa)">
          <span><span class="text-(--tx2)">↑ ↓</span> move</span>
          <span><span class="text-(--tx2)">Enter</span> connect</span>
          <span><span class="text-(--tx2)">Esc</span> back</span>
          <span><span class="text-(--tx2)">{{ prefs.kl('sshDetach') }}</span> leave a connection running</span>
          <span><span class="text-(--tx2)">{{ prefs.kl('ssh') }}</span> close</span>
          <div class="flex-1" />
          <span class="cursor-pointer hover:text-(--tx2)" @click="ui.openSettings('keys')">change keys</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
