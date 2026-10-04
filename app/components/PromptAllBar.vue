<script setup lang="ts">
// "Prompt all" bar: one prompt typed into every ticked session of the current project.
const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()

const ss = computed(() => (P.sel ? S.claudeOf(P.sel) : []))

const text = computed({
  get: () => ui.bc?.text || '',
  set: (v: string) => { if (ui.bc) ui.bc = { ...ui.bc, text: v } },
})

const targets = computed(() => ss.value.map((s) => {
  const on = !!ui.bc?.targets.includes(s.id)
  return { id: s.id, on, repo: P.repoOf(s.pid, s.repoId).label, title: s.title, dot: SC[s.status] }
}))

const n = computed(() => targets.value.filter(t => t.on).length)
const canSend = computed(() => n.value > 0 && !!text.value.trim())

function toggle(id: string) {
  const b = ui.bc
  if (!b) return
  ui.bc = { ...b, targets: b.targets.includes(id) ? b.targets.filter(t => t !== id) : [...b.targets, id] }
}

function close() {
  ui.bc = null
  ui.focusLater()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    ui.sendBc()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}
</script>

<template>
  <div v-if="ui.bc" class="flex flex-none flex-col gap-2 border-b border-(--ln) px-3 py-2.5 text-(--tx)" style="background: color-mix(in oklch, var(--lnk) 7%, var(--head))">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="mr-1 text-[12px] font-semibold">Prompt</span>
      <div
        v-for="t in targets"
        :key="t.id"
        class="box-border flex h-6 max-w-[280px] cursor-pointer items-center gap-1.5 rounded-sm border pr-2 pl-1.5 text-[11.5px]"
        :style="{ borderColor: t.on ? 'var(--bb)' : 'var(--ln)', background: t.on ? 'var(--segon)' : 'transparent' }"
        @mousedown.prevent
        @click="toggle(t.id)"
      >
        <UCheckbox
          :model-value="t.on"
          color="neutral"
          tabindex="-1"
          class="pointer-events-none flex-none"
          :ui="{ base: 'size-3 rounded-sm ring-(--bb)', indicator: 'bg-(--inv) text-(--invtx)', icon: 'size-2.5' }"
        />
        <span class="size-1.5 flex-none rounded-full" :style="{ background: t.dot }" />
        <span class="chip-repo">{{ t.repo }}</span>
        <span class="ellipsis text-(--tx2)">{{ t.title }}</span>
      </div>
      <div class="flex-1" />
      <span class="text-[11px] text-(--fa)">Enter sends · Esc closes</span>
      <span class="grid size-5 cursor-pointer place-items-center rounded-sm text-[11px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)" @click="close"><UIcon name="i-hugeicons-cancel-01" class="size-3" /></span>
    </div>
    <div class="flex gap-2">
      <UInput
        v-model="text"
        variant="none"
        autofocus
        placeholder="One prompt, sent to every selected session"
        class="min-w-0 flex-1"
        :ui="{
          root: 'flex h-8 items-center gap-2 rounded-md border border-(--bb) bg-(--term) px-2.5',
          base: 'mono h-auto p-0 text-[12px] text-(--ttx) bg-transparent rounded-none',
          leading: 'static p-0',
        }"
        @keydown="onKey"
      >
        <template #leading>
          <span class="mono text-[12px] text-(--mu)">&gt;</span>
        </template>
      </UInput>
      <UButton
        color="primary"
        class="h-8 gap-2 px-3.5 whitespace-nowrap"
        :style="{ opacity: canSend ? 1 : 0.45 }"
        @mousedown.prevent
        @click="ui.sendBc()"
      >
        Send to {{ n }}<span class="mono text-[10.5px] font-medium opacity-60">Enter</span>
      </UButton>
    </div>
  </div>
</template>
