<script setup lang="ts">
import { k } from '~/utils/format'

// Session details (Ctrl Shift D) for the focused session.
const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const prefs = usePrefsStore()

const s = computed(() => ui.focused)
const p = computed(() => ui.cur)

const open = computed({
  get: () => ui.details && p.value?.view === 'terminals' && !!s.value,
  set: (v: boolean) => {
    if (v) return
    ui.details = false
    ui.focusLater()
  },
})

const d = computed(() => {
  const fs = s.value, cur = p.value
  if (!fs || !cur) return null
  const r = P.repoOf(fs.pid, fs.repoId)
  const prompts = fs.prompts.slice(-5).reverse().map((x, i) => ({ at: x.at ? clock(x.at) : '', t: x.t, color: i === 0 ? 'var(--tx2)' : 'var(--mu)' }))
  return {
    status: SL[fs.status], statusBg: SC[fs.status], where: `${cur.name} · ${r.label}`, title: fs.title,
    model: fs.model || '-', branch: fs.branch, started: 'Today ' + clock(fs.started), dur: dur(ui.now - fs.started, true),
    folder: fs.cwd, cmd: fs.cmd, uid: fs.claudeId ? fs.claudeId.slice(0, 8) + '…' : '-',
    wt: fs.wt, wtText: fs.wt ? fs.branch + ' → ' + fs.wt.base : '',
    cost: usd(S.cost(fs)), tin: k(fs.tokIn), tout: k(fs.tokOut), cr: k(fs.cacheR), cw: k(fs.cacheW),
    ctx: Math.round(fs.ctx), editor: cur.editor, prompts,
  }
})

async function openFolder() {
  const fs = s.value, cur = p.value
  if (!fs || !cur) return
  await api.sys.showInFolder(fs.cwd)
  ui.toast({ title: 'Opening folder in Explorer', body: fs.cwd, hue: cur.hue })
}

function copyId() {
  const fs = s.value, cur = p.value
  if (!fs || !cur) return
  if (!fs.claudeId) {
    ui.toast({ title: 'No session ID yet', body: 'Claude Code reports it once the session starts.', hue: cur.hue })
    return
  }
  navigator.clipboard.writeText(fs.claudeId).catch(() => {})
  ui.toast({ title: 'Session ID copied', body: fs.claudeId, hue: cur.hue })
}
</script>

<template>
  <UModal
    v-model:open="open"
    scrollable
    :close="false"
    :ui="{
      overlay: 'bg-(--ovl) place-items-[start_center] p-[56px_16px] sm:p-[56px_16px]',
      content: 'w-full max-w-[440px] bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0',
    }"
  >
    <template #content>
      <div class="flex h-10 flex-none items-center justify-between border-b border-(--ln2) pr-2.5 pl-3.5">
        <span class="label-caps">Session details</span>
        <span class="grid size-5 cursor-pointer place-items-center rounded-sm text-[11px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)" @click="open = false"><UIcon name="i-hugeicons-cancel-01" class="size-3" /></span>
      </div>
      <div v-if="d" class="flex flex-col gap-[18px] px-[18px] pt-4 pb-[18px] text-(--tx)">
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2">
            <UBadge
              :label="d.status"
              variant="solid"
              class="h-auto rounded-sm px-1.5 py-px text-[10.5px] font-semibold text-[#131417]"
              :style="{ background: d.statusBg }"
            />
            <span class="text-[11.5px] text-(--mu)">{{ d.where }}</span>
          </div>
          <div class="line-clamp-3 text-[14px] leading-[1.35] font-semibold text-(--tx)">{{ d.title }}</div>
        </div>

        <div class="grid grid-cols-[76px_minmax(0,1fr)] gap-y-[7px] text-[12px]">
          <span class="text-(--mu)">Model</span><span class="mono text-[11.5px]">{{ d.model }}</span>
          <span class="text-(--mu)">Branch</span><span class="mono ellipsis text-[11.5px]">{{ d.branch }}</span>
          <span class="text-(--mu)">Started</span><span class="mono text-[11.5px]">{{ d.started }}</span>
          <span class="text-(--mu)">Duration</span><span class="mono text-[11.5px]">{{ d.dur }}</span>
          <span class="text-(--mu)">Folder</span><span class="mono ellipsis text-[11.5px]" :title="d.folder">{{ d.folder }}</span>
          <span class="text-(--mu)">Command</span><span class="mono ellipsis text-[11.5px]" :title="d.cmd">{{ d.cmd }}</span>
          <span class="text-(--mu)">Session</span><span class="mono text-[11.5px] text-(--tx3)">{{ d.uid }}</span>
        </div>

        <div v-if="d.wt" class="flex items-center gap-2.5 rounded-lg border border-(--ln) px-3 py-2.5" style="background: color-mix(in oklch, var(--teal) 8%, transparent)">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex items-center gap-1 text-[12px] font-semibold text-(--teal)"><UIcon name="i-hugeicons-git-fork" class="size-3" />Worktree</span>
            <span class="mono ellipsis text-[11px] text-(--tx3)">{{ d.wtText }}</span>
          </div>
          <UButton size="sm" color="neutral" variant="outline" class="text-[11.5px] whitespace-nowrap" :label="`Merge into ${d.wt.base}`" @click="ui.mergeWt(s!.id)" />
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-baseline justify-between">
            <span class="label-caps">Tokens</span>
            <span class="mono text-[16px] font-medium text-(--tx)">{{ d.cost }}</span>
          </div>
          <div class="grid grid-cols-[1fr_auto] gap-y-[5px] text-[12px]">
            <span class="text-(--tx3)">Input</span><span class="mono text-[11.5px]">{{ d.tin }}</span>
            <span class="text-(--tx3)">Output</span><span class="mono text-[11.5px]">{{ d.tout }}</span>
            <span class="text-(--tx3)">Cache read</span><span class="mono text-[11.5px]">{{ d.cr }}</span>
            <span class="text-(--tx3)">Cache write</span><span class="mono text-[11.5px]">{{ d.cw }}</span>
          </div>
          <div class="mt-1 flex flex-col gap-1">
            <div class="flex justify-between text-[11px] text-(--mu)">
              <span>Context window</span><span class="mono">{{ d.ctx }}%</span>
            </div>
            <UProgress
              :model-value="Math.min(100, d.ctx)"
              :max="100"
              :ui="{ root: 'gap-0', base: 'h-1 rounded-xs bg-(--trk)', indicator: 'rounded-none bg-(--tx3)' }"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <UButton color="primary" size="md" class="justify-between px-2.5" @click="ui.openEditor()">
            <span>Open in {{ d.editor }}</span>
            <span class="mono text-[10.5px] font-medium opacity-60">{{ prefs.kl('editor') }}</span>
          </UButton>
          <div class="grid grid-cols-2 gap-1.5">
            <UButton size="sm" color="neutral" variant="outline" class="justify-center text-[11.5px]" label="Open folder" @click="openFolder" />
            <UButton size="sm" color="neutral" variant="outline" class="justify-center text-[11.5px]" label="Copy session ID" @click="copyId" />
          </div>
        </div>

        <div v-if="d.prompts.length" class="flex flex-col gap-[7px]">
          <span class="label-caps">Prompts in this session</span>
          <div v-for="(pr, i) in d.prompts" :key="i" class="flex gap-2 text-[12px]">
            <span class="mono w-9 flex-none pt-px text-[10.5px] text-(--fa)">{{ pr.at }}</span>
            <span class="line-clamp-2 leading-[1.4]" :style="{ color: pr.color }">{{ pr.t }}</span>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
