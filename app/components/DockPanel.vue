<script setup lang="ts">
// The dock panel: docked shells first, then dev server logs, one tab each. Docks at the bottom or on the right.
import type { DropdownMenuItem } from '@nuxt/ui'
import { createReusableTemplate } from '@vueuse/core'
import type { PanelDock } from '#shared/types'

const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const V = useServicesStore()
const prefs = usePrefsStore()

const [DefineActions, ReuseActions] = createReusableTemplate()

const SVC: Record<string, string> = { running: 'var(--grn)', starting: 'var(--ambf)', stopped: 'var(--idle)' }
const LC: Record<string, string> = { fa: 'var(--fa)', tx3: 'var(--tx3)', tx: 'var(--tx)', grn: 'var(--grn)', red: 'var(--red)', blue: 'var(--blue)', amb: 'var(--amb)' }

const cur = computed(() => P.current)
const shells = computed(() => (cur.value ? S.dockedOf(cur.value.id) : []))
const list = computed(() => V.ofProject(cur.value))

/** The selected tab: a docked shell or a dev server, falling back to the first of either. */
const shell = computed(() => shells.value.find(s => s.id === ui.svcTab) || null)
const cv = computed(() => (shell.value ? null : list.value.find(v => v.id === ui.svcTab) || list.value[0] || null))
const activeShell = computed(() => shell.value || (!cv.value ? shells.value[0] || null : null))

const st = computed(() => (cv.value ? V.status(cv.value.id) : 'stopped'))
const lines = computed(() => (cv.value ? V.runtime[cv.value.id]?.log || [] : []))
const stLabel = computed(() => st.value === 'running' ? (cv.value?.port ? 'Running on :' + cv.value.port : 'Running') : st.value === 'starting' ? 'Starting…' : 'Stopped')

// ---------- Dock side and size ----------
const dock = computed<PanelDock>(() => prefs.prefs.panelDock || 'bottom')
const right = computed(() => dock.value === 'right')
const MIN = { bottom: 120, right: 280 }
const size = computed(() => {
  const s = prefs.prefs.panelSize?.[dock.value] ?? (right.value ? 460 : 260)
  const max = right.value ? ui.width * 0.7 : window.innerHeight * 0.75
  return Math.round(Math.min(max, Math.max(MIN[dock.value], s)))
})

function setDock(d: PanelDock) {
  prefs.set({ panelDock: d })
}

/** Drag the inner edge to resize; the size is remembered per side. */
function startResize(e: MouseEvent) {
  e.preventDefault()
  const start = right.value ? e.clientX : e.clientY
  const from = size.value
  const side = dock.value
  const move = (ev: MouseEvent) => {
    const delta = start - (side === 'right' ? ev.clientX : ev.clientY)
    prefs.set({ panelSize: { ...{ bottom: 260, right: 460 }, ...prefs.prefs.panelSize, [side]: Math.max(MIN[side], from + delta) } })
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    document.body.style.cursor = ''
  }
  document.body.style.cursor = side === 'right' ? 'ew-resize' : 'ns-resize'
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

const newShellItems = computed<DropdownMenuItem[][]>(() => [[
  ...S.shells.map(sh => ({
    label: sh.label + (sh.kind === prefs.prefs.shell ? ' (default)' : ''),
    onSelect: () => ui.newPanelShell(sh.kind),
  })),
]])

/** When the menu closes, focus goes to the shell in view (the new one when one was picked), not back to the + button. */
const pickerContent = {
  align: 'start' as const,
  sideOffset: 4,
  onCloseAutoFocus: (e: Event) => {
    e.preventDefault()
    setTimeout(() => { if (activeShell.value) focusTerminal(activeShell.value.id) }, 0)
  },
}

function prim() {
  const v = cv.value
  if (!v) return
  if (st.value === 'stopped') V.start(v, v.repo)
  else V.stop(v.id)
}

function restart() {
  const v = cv.value
  if (v) V.restart(v, v.repo)
}

function open() {
  if (cv.value?.port) api.sys.openExternal('http://localhost:' + cv.value.port)
}

function remove() {
  const v = cv.value, p = cur.value
  if (!v || !p) return
  P.update(p.id, q => ({ ...q, repos: q.repos.map(r => ({ ...r, services: (r.services || []).filter(x => x.id !== v.id) })) }))
  V.forget(v.id)
}

function closeShell(id: string) {
  const i = shells.value.findIndex(s => s.id === id)
  S.close(id)
  const rest = shells.value.filter(s => s.id !== id)
  const next = rest[Math.min(i, rest.length - 1)]
  if (next) ui.svcTab = next.id
  else if (list.value[0]) ui.svcTab = list.value[0].id
  else ui.logsOpen = false
}

const btn = 'h-[22px] flex-none whitespace-nowrap rounded px-2 py-0 text-[11px] font-normal'
const tab = 'mono box-border flex h-6 max-w-[220px] min-w-0 shrink grow-0 basis-auto cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-[9px] text-[11px]'
const iconBtn = 'grid size-[22px] flex-none place-items-center rounded p-0 text-[11px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)'
</script>

<template>
  <DefineActions>
    <template v-if="cv">
      <span class="mx-1.5 flex flex-none items-center gap-1.5 whitespace-nowrap text-[11px] text-(--tx3)">
        <span class="size-1.5 rounded-full" :style="{ background: SVC[st] }" />{{ stLabel }}
      </span>
      <UButton v-if="st === 'running' && cv?.port" color="neutral" variant="ghost" :class="[btn, 'text-(--lnk) hover:bg-(--hov)']" @click="open">
        Open<UIcon name="i-hugeicons-arrow-up-right-01" class="size-3" />
      </UButton>
      <UButton color="neutral" variant="outline" :class="[btn, 'bg-transparent text-(--tx2) ring-(--bb) hover:bg-(--hov)']" @click="prim">
        {{ st === 'stopped' ? 'Start' : 'Stop' }}
      </UButton>
      <UButton color="neutral" variant="outline" :class="[btn, 'bg-transparent text-(--tx2) ring-(--bb) hover:bg-(--hov)']" @click="restart">
        Restart
      </UButton>
      <UTooltip text="Remove this dev server from the project">
        <UButton color="neutral" variant="ghost" :class="[btn, 'text-(--mu) hover:bg-(--hov) hover:text-(--red)']" @click="remove">
          Remove
        </UButton>
      </UTooltip>
      <UButton color="neutral" variant="ghost" :class="[btn, 'text-(--mu) hover:bg-(--hov) hover:text-(--tx)']" @click="V.clear(cv.id)">
        Clear
      </UButton>
    </template>
    <span v-else-if="activeShell" class="mono mx-1.5 min-w-0 flex-1 truncate text-[11px] text-(--fa)" :class="right ? '' : 'max-w-[40%] flex-none'" :title="activeShell.cwd">{{ activeShell.cwd }}</span>
  </DefineActions>

  <div
    v-if="cur && (list.length || shells.length)"
    data-dock-panel
    class="relative flex flex-none flex-col bg-(--term)"
    :class="right ? 'min-h-0 border-l border-(--ln)' : 'border-t border-(--ln)'"
    :style="right ? { width: size + 'px' } : { height: size + 'px' }"
  >
    <!-- Drag the inner edge to resize -->
    <div
      class="absolute z-10"
      :class="right ? 'inset-y-0 -left-[3px] w-[6px] cursor-ew-resize' : 'inset-x-0 -top-[3px] h-[6px] cursor-ns-resize'"
      @mousedown="startResize"
    />

    <div class="flex flex-none flex-col border-b border-(--ln2) bg-(--chrome)">
      <div class="flex h-8 items-center gap-0.5 overflow-hidden px-1.5">
        <div class="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          <div
            v-for="s in shells"
            :key="s.id"
            :title="s.cwd"
            :class="tab"
            :style="{ background: s.id === activeShell?.id ? 'var(--term)' : 'transparent', color: s.id === activeShell?.id ? 'var(--tx)' : 'var(--mu)' }"
            @click="ui.svcTab = s.id"
          >
            <UIcon name="i-hugeicons-command-line" class="size-3 flex-none" />
            <span class="chip-repo">{{ P.repoOf(s.pid, s.repoId).label }}</span>
            <span class="ellipsis">{{ S.shellLabel(s.shell) }}</span>
            <span
              title="Close shell"
              class="grid size-4 flex-none place-items-center rounded-sm text-(--fa) hover:bg-(--hov) hover:text-(--tx)"
              @click.stop="closeShell(s.id)"
            ><UIcon name="i-hugeicons-cancel-01" class="size-2.5" /></span>
          </div>
          <UDropdownMenu v-model:open="ui.shellPicker" :items="newShellItems" :content="pickerContent" :ui="{ content: 'w-[220px]' }">
            <UTooltip :text="`New shell (${prefs.kl('shellNewPick')})`">
              <button class="grid size-6 flex-none cursor-pointer place-items-center rounded text-(--mu) hover:bg-(--hov) hover:text-(--tx)">
                <UIcon name="i-hugeicons-add-01" class="size-3.5" />
              </button>
            </UTooltip>
          </UDropdownMenu>
          <span v-if="shells.length && list.length" class="mx-1 h-4 w-px flex-none bg-(--ln)" />
          <div
            v-for="v in list"
            :key="v.id"
            :title="v.cmd"
            :class="tab"
            :style="{ background: v.id === cv?.id ? 'var(--term)' : 'transparent', color: v.id === cv?.id ? 'var(--tx)' : 'var(--mu)' }"
            @click="ui.svcTab = v.id"
          >
            <span class="size-1.5 flex-none rounded-full" :style="{ background: SVC[V.status(v.id)] }" />
            <span class="chip-repo">{{ v.repo.label }}</span>
            <span class="ellipsis">{{ v.cmd }}</span>
          </div>
        </div>

        <ReuseActions v-if="!right" />

        <UTooltip :text="right ? 'Dock at the bottom' : 'Dock on the right'">
          <UButton color="neutral" variant="ghost" :class="iconBtn" @click="setDock(right ? 'bottom' : 'right')">
            <UIcon :name="right ? 'i-hugeicons-panel-bottom' : 'i-hugeicons-panel-right'" class="size-3.5" />
          </UButton>
        </UTooltip>
        <UTooltip :text="`Hide panel (${prefs.kl('shell')})`">
          <UButton color="neutral" variant="ghost" :class="iconBtn" @click="ui.logsOpen = false">
            <UIcon :name="right ? 'i-hugeicons-arrow-right-01' : 'i-hugeicons-arrow-down-01'" class="size-3.5" />
          </UButton>
        </UTooltip>
      </div>
      <!-- Docked on the right the panel is narrow, so the actions get their own row -->
      <div v-if="right && (cv || activeShell)" class="flex h-8 items-center gap-0.5 overflow-hidden border-t border-(--ln2) px-1.5">
        <ReuseActions />
      </div>
    </div>

    <PanelShell v-if="activeShell" :key="activeShell.id" :sid="activeShell.id" />
    <!-- column-reverse keeps the view pinned to the newest line unless the user scrolls up -->
    <div v-else class="flex min-h-0 flex-1 flex-col-reverse overflow-auto select-text">
      <div class="mono px-3 pt-1.5 pb-2 text-[11.5px] leading-[1.55]">
        <div v-for="(ln, i) in lines" :key="i" class="min-h-[1.55em] break-all whitespace-pre-wrap" :style="{ color: LC[ln.c] || 'var(--tx3)' }">{{ ln.t }}</div>
        <div v-if="!lines.length" class="text-(--fa)">Not started yet. Press Start to run it.</div>
      </div>
    </div>
  </div>
</template>
