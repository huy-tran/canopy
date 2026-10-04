<script setup lang="ts">
// Inbox (Ctrl Shift I): waiting sessions, answered one after another.
const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const prefs = usePrefsStore()

const shown = computed(() => (ui.inbox?.sid ? S.byId(ui.inbox.sid) : null))

const pos = computed(() => {
  const s = shown.value
  if (!s) return ''
  const wl = ui.waitList
  const i = wl.findIndex(x => x.id === s.id)
  return i >= 0 ? `${i + 1} of ${wl.length}` : `${wl.length} more waiting`
})

const items = computed(() => ui.waitList.map((s) => {
  const p = P.byId(s.pid)
  const a = shown.value?.id === s.id
  const t = ago(ui.now - (s.waitingSince || ui.now))
  return {
    id: s.id,
    color: p ? pcol(p.hue) : 'var(--idle)',
    name: (p?.name || '').split(' ')[0],
    repo: P.repoOf(s.pid, s.repoId).label,
    t: t === 'now' ? '<1m' : t,
    bg: a ? 'var(--modal)' : 'transparent',
    bd: a ? 'var(--ambl)' : 'var(--ln)',
  }
}))
</script>

<template>
  <div v-if="ui.inbox" class="flex flex-none items-center gap-2 overflow-hidden border-b border-(--ambl) bg-(--ambs) px-2.5 py-1.5 text-(--tx)">
    <span class="text-[12px] font-semibold whitespace-nowrap text-(--ambtx)">Inbox</span>
    <span class="text-[11.5px] whitespace-nowrap text-(--tx3)">{{ pos }}</span>
    <span v-if="!shown" class="flex items-center gap-1 text-[12px] whitespace-nowrap text-(--grn)"><UIcon name="i-hugeicons-tick-02" class="size-3" />All caught up. Nothing is waiting on you.</span>
    <div class="flex min-w-0 flex-1 gap-1 overflow-hidden">
      <div
        v-for="it in items"
        :key="it.id"
        class="flex h-[22px] flex-none cursor-pointer items-center gap-1.5 rounded-sm border px-2 text-[11.5px] whitespace-nowrap"
        :style="{ borderColor: it.bd, background: it.bg }"
        @click="ui.inboxGo(it.id)"
      >
        <span class="size-[7px] rounded-xs" :style="{ background: it.color }" />{{ it.name }}<span class="chip-repo">{{ it.repo }}</span><span class="mono text-[10.5px] text-(--amb)">{{ it.t }}</span>
      </div>
    </div>
    <span v-if="shown && shown.status !== 'waiting'" class="text-[11.5px] whitespace-nowrap text-(--tx3)">Answered · moving to the next one…</span>
    <AnswerButtons v-else-if="shown" :sid="shown.id" />
    <span class="flex h-[22px] flex-none cursor-pointer items-center gap-1.5 rounded-sm border border-(--bb) px-2 text-[11.5px] whitespace-nowrap text-(--tx2) hover:bg-(--hov)" @click="ui.inboxSkip()">
      Skip<span class="mono text-[10px] text-(--fa)">{{ prefs.kl('nextWaiting') }}</span>
    </span>
    <span class="flex h-[22px] flex-none cursor-pointer items-center gap-1.5 rounded-sm px-2 text-[11.5px] whitespace-nowrap text-(--tx3) hover:bg-(--hov) hover:text-(--tx)" @click="ui.inbox = null">
      Exit<span class="mono text-[10px] text-(--fa)">{{ prefs.kl('inbox') }}</span>
    </span>
  </div>
</template>
