<script setup lang="ts">
// Ctrl Shift P: projects and sessions. Ctrl K: commands. Same list, filter and keys as the prototype.
interface PalItem {
  id: string
  label: string
  hint: string
  mc: string
  mr: string
  ms: string
  run: () => void
}

const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const V = useServicesStore()
const prefs = usePrefsStore()

const q = ref('')
let running = false

const open = computed({
  get: () => ui.palette != null,
  set: (v: boolean) => {
    if (v) return
    ui.palette = null
    if (!running) ui.focusLater()
  },
})

const isCmd = computed(() => ui.palette === 'cmd')

watch(() => ui.palette, () => { q.value = '' })

const navItems = computed<PalItem[]>(() => {
  const items: PalItem[] = []
  const rank = (st: string) => (st === 'waiting' ? 0 : 1)
  ;[...S.sessions].sort((a, b) => rank(a.status) - rank(b.status)).forEach((s) => {
    const p = P.byId(s.pid)
    if (!p) return
    const r = P.repoOf(s.pid, s.repoId)
    if (s.kind === 'shell') {
      const run = s.docked
        ? () => { ui.selectProject(s.pid); P.patch(s.pid, { view: 'terminals' }); ui.svcTab = s.id; ui.logsOpen = true; setTimeout(() => focusTerminal(s.id), 60) }
        : () => ui.focusSession(s.id)
      items.push({ id: 's' + s.id, label: `${p.name} · ${r.label} · ${S.shellLabel(s.shell)}`, hint: s.docked ? 'Shell panel' : 'Shell', mc: 'transparent', mr: '0', ms: '7px', run })
      return
    }
    items.push({ id: 's' + s.id, label: `${p.name} · ${r.label} · ${s.title}`, hint: SL[s.status] || '', mc: SC[s.status] || 'var(--idle)', mr: '50%', ms: '7px', run: () => ui.focusSession(s.id) })
  })
  P.ordered.forEach((p, i) => items.push({ id: 'p' + p.id, label: p.name, hint: i < 9 ? `Alt ${i + 1}` : 'Project', mc: pcol(p.hue), mr: '3px', ms: '10px', run: () => ui.selectProject(p.id) }))
  return items
})

const cmdItems = computed<PalItem[]>(() => {
  const cmds: PalItem[] = []
  const kl = prefs.kl
  const C = (label: string, hint: string, run: () => void) => cmds.push({ id: 'c' + cmds.length, label, hint, mc: 'transparent', mr: '0', ms: '7px', run })
  C('Layout: tabs', kl('cycleLayout'), () => ui.setLayout('tabs'))
  C('Layout: split', kl('cycleLayout'), () => ui.setLayout('split'))
  C('Layout: grid', kl('cycleLayout'), () => ui.setLayout('grid'))
  C('Toggle Terminals / Overview', kl('toggleView'), () => ui.toggleView())
  C('3D World: open or close', kl('simulation'), () => { ui.sim = !ui.sim })
  C('GitHub: open or close', kl('github'), () => ui.runAction('github'))
  C('Next session waiting on you', kl('nextWaiting'), () => ui.nextWaiting())
  C('New session in focused repo', kl('newSession'), () => ui.newSession())
  C('New project…', kl('newProject'), () => ui.openModal('add'))
  C('Edit project…', '', () => ui.openModal('edit'))
  C('Open waiting inbox', kl('inbox'), () => ui.toggleInbox())
  C('Prompt all sessions in this project', kl('promptAll'), () => ui.openBc())
  C('Share this session’s changes with the other repo', kl('share'), () => ui.shareFocused())
  C('Dev servers: show or hide logs', kl('logs'), () => ui.toggleLogs())
  C('Shell: show or hide the shell panel', kl('shell'), () => ui.toggleShellPanel())
  ;(P.current?.repos || []).forEach(r => C(`Open shell in ${r.label}`, '', () => ui.openShell(r.id)))
  C('Dev servers: start all', '', () => V.startProject(P.current))
  C('Dev servers: stop all', '', () => V.stopProject(P.current))
  C('New session in a new worktree', '', () => ui.newSession(null, true))
  C('Files: search and browse the focused repo', kl('files'), () => ui.openExplorer('files'))
  C('Files: show git changes', kl('files'), () => ui.openExplorer('changes'))
  C('Daily summary for this project', '', () => ui.openSummary())
  C('Open focused repo in editor', kl('editor'), () => ui.openEditor())
  C('Session details', kl('details'), () => { ui.details = !ui.details })
  C('Show or hide image strip', kl('strip'), () => { ui.stripOn = !ui.stripOn })
  C(`Switch to ${prefs.resolvedTheme === 'light' ? 'dark' : 'light'} theme`, '', () => prefs.toggleTheme())
  C('Keyboard shortcuts', kl('shortcuts'), () => ui.openSettings('keys'))
  C('Settings', kl('settings'), () => ui.openSettings('general'))
  C('Check for updates', '', () => ui.checkUpdates())
  C('About Canopy', '', () => { ui.about = true })
  return cmds
})

const list = computed(() => {
  const src = isCmd.value ? cmdItems.value : navItems.value
  const t = q.value.trim().toLowerCase()
  const words = t.split(/\s+/)
  return (t ? src.filter(it => words.every(w => it.label.toLowerCase().includes(w))) : src).slice(0, 14)
})

const groups = computed(() => [{
  id: 'pal',
  ignoreFilter: true,
  items: list.value.map(it => ({ ...it, onSelect: () => runPal(it) })),
}])

function runPal(it: PalItem) {
  running = true
  ui.palette = null
  setTimeout(() => {
    running = false
    it.run()
  }, 0)
}
</script>

<template>
  <UModal
    v-model:open="open"
    scrollable
    :close="false"
    :ui="{
      overlay: 'bg-(--ovl) place-items-[start_center] p-[56px_16px_16px] sm:p-[56px_16px_16px]',
      content: 'w-full max-w-[580px] bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0 overflow-hidden',
    }"
  >
    <template #content>
      <UCommandPalette
        v-model:search-term="q"
        :groups="groups"
        :fuse="{ resultLimit: 14 }"
        :icon="false"
        :placeholder="isCmd ? 'Run a command…' : 'Jump to a project or session…'"
        :input="{ ui: { root: 'w-full', base: 'h-11 px-4 py-0 text-[14px] text-(--tx) bg-transparent rounded-none placeholder:text-(--fa)' } }"
        :ui="{
          root: 'divide-(--ln)',
          input: '[&>input]:h-11',
          content: 'flex-none',
          viewport: 'max-h-[420px] p-1.5 divide-y-0',
          group: 'p-0',
          item: 'h-8 px-2.5 py-0 gap-2.5 items-center text-left rounded-lg cursor-pointer before:hidden data-highlighted:bg-(--sel)',
          empty: 'px-4 py-5 text-left text-[12px] text-(--fa)',
          footer: 'flex gap-3.5 px-3.5 py-2 text-[11px] text-(--fa)',
        }"
      >
        <template #item="{ item }">
          <div class="grid w-2.5 flex-none place-items-center">
            <div :style="{ width: item.ms, height: item.ms, borderRadius: item.mr, background: item.mc }" />
          </div>
          <span class="ellipsis flex-1 text-[12.5px] text-(--tx)">{{ item.label }}</span>
          <span class="mono whitespace-nowrap text-[10.5px] text-(--fa)">{{ item.hint }}</span>
        </template>
        <template #empty>
          Nothing matches.
        </template>
        <template #footer>
          <span class="text-(--tx3)">{{ isCmd ? 'Commands' : 'Projects and sessions' }}</span>
          <span>↑ ↓ move</span>
          <span>Enter open</span>
          <span>Esc close</span>
          <div class="flex-1" />
          <span>{{ isCmd ? `${prefs.kl('jump')} projects and sessions` : `${prefs.kl('commands')} commands` }}</span>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
