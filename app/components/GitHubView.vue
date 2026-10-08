<script setup lang="ts">
// The GitHub view: gh-tui (or another terminal app) in one long-lived terminal, shown in place of the selected project.
const ui = useUiStore()
const prefs = usePrefsStore()

const host = ref<HTMLElement | null>(null)
const custom = computed(() => (prefs.prefs.githubCmd || '').trim())
const cmd = computed(() => ui.ghCheck?.cmd || custom.value || 'gh-tui')
const missing = computed(() => ui.ghRun === 'missing')
const check = computed(() => ui.ghCheck)

/** Steps to get the GitHub view working on this PC, in order. */
const steps = computed(() => {
  const s: { title: string; cmd: string; sub?: string; link?: { label: string; url: string } }[] = []
  if (!check.value?.gh) {
    s.push({ title: 'Install the GitHub CLI', cmd: 'winget install --id GitHub.cli', link: { label: 'cli.github.com', url: 'https://cli.github.com/' } })
    s.push({ title: 'Sign in to GitHub', cmd: 'gh auth login' })
  }
  if (!custom.value) {
    s.push({ title: 'Install gh-tui', cmd: 'go install github.com/huy-tran/github-tui@latest', sub: 'Needs Go 1.25 or later. Installs as github-tui, which Canopy also looks for.', link: { label: 'go.dev/dl', url: 'https://go.dev/dl/' } })
  }
  return s
})

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => ui.toast({ title: 'Copied', body: text })).catch(() => {})
}

const openUrl = (url: string) => api.sys.openExternal(url)

function switchTo(c: string) {
  prefs.set({ githubCmd: c })
  ui.restartGithub()
}

/** Once the app has quit, Enter starts it again. */
function onKey(e: KeyboardEvent) {
  if (ui.ghRun !== 'exited' || e.key !== 'Enter') return
  e.preventDefault()
  e.stopPropagation()
  ui.restartGithub()
}

onMounted(() => {
  attachTerminal(GH_TERM, host.value!)
  nextTick(() => focusTerminal(GH_TERM))
})

onBeforeUnmount(() => {
  if (host.value) detachTerminal(GH_TERM, host.value)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-9 flex-none items-center gap-2 border-b border-(--ln) bg-(--chrome) pl-3.5 pr-2">
      <UIcon name="i-hugeicons-github" class="size-4 text-(--tx2)" />
      <span class="text-[13px] font-semibold">GitHub</span>
      <span v-if="!missing" class="mono rounded-sm bg-(--chip) px-[5px] py-px text-[10.5px] text-(--tx2)">{{ cmd }}</span>
      <span v-if="ui.ghRun === 'exited'" class="text-[11.5px] text-(--fa)">Quit · press Enter to start it again</span>
      <div class="flex-1" />
      <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('github') }} to close</span>
      <UButton v-if="!missing" size="xs" color="neutral" variant="ghost" icon="i-hugeicons-refresh" title="Restart" @click="ui.restartGithub()" />
      <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Back to terminals" @click="ui.runAction('github')" />
    </div>

    <div v-if="missing" class="min-h-0 flex-1 overflow-auto">
      <div class="mx-auto flex max-w-[560px] flex-col gap-4 px-6 py-12">
        <div class="flex flex-col gap-1">
          <span class="text-[15px] font-semibold">{{ custom ? `${custom.split(/\s+/)[0]} isn't installed` : 'gh-tui isn\'t installed on this PC' }}</span>
          <span class="text-[12px] leading-[1.5] text-(--mu)">
            The GitHub view runs <span class="mono">{{ check?.tried.join(' or ') }}</span>, and {{ (check?.tried.length || 0) > 1 ? 'neither was' : 'it wasn\'t' }} found on your PATH.
            <template v-if="!check?.gh"> The GitHub CLI isn't installed either: it's needed for the GitHub view and for review notifications.</template>
          </span>
        </div>

        <div v-for="(s, i) in steps" :key="s.cmd" class="flex flex-col gap-1.5">
          <span class="text-[12.5px] font-medium">{{ i + 1 }}. {{ s.title }}</span>
          <div class="flex items-center gap-2 rounded-md border border-(--ln) bg-(--inp) py-1 pl-2.5 pr-1">
            <span class="mono ellipsis flex-1 select-text text-[12px]">{{ s.cmd }}</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-copy-01" title="Copy" @click="copy(s.cmd)" />
          </div>
          <span v-if="s.sub || s.link" class="text-[11.5px] text-(--fa)">
            {{ s.sub }}
            <a v-if="s.link" class="cursor-pointer text-(--lnk)" @click="openUrl(s.link.url)">{{ s.link.label }}</a>
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <UButton size="sm" color="primary" icon="i-hugeicons-refresh" label="Check again" @click="ui.restartGithub()" />
          <UButton v-if="check?.ghDash" size="sm" color="neutral" variant="subtle" label="Use gh dash instead" @click="switchTo('gh dash')" />
          <UButton v-if="custom" size="sm" color="neutral" variant="subtle" label="Use gh-tui instead" @click="switchTo('')" />
          <UButton size="sm" color="neutral" variant="ghost" label="Change the command in Settings" @click="ui.openSettings('general')" />
        </div>
      </div>
    </div>

    <div v-show="!missing" class="min-h-0 flex-1 overflow-hidden bg-(--term) px-2.5 pt-1" :class="{ dark: prefs.terminalDark }" @keydown.capture="onKey" @click="focusTerminal(GH_TERM)">
      <div ref="host" class="h-full w-full" />
    </div>
  </div>
</template>
