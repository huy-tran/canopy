<script setup lang="ts">
// The GitHub window's screens, built on the gh CLI: PRs waiting for review and the user's own, a PR's
// diff with review and merge, repos with running workflows, workflow runs and Dependabot alerts.
import type { GhTab } from '~/stores/github'

const G = useGithubStore()
const R = useReviewsStore()
const GW = useGhWorldStore()
const ui = useUiStore()


const NAV = computed(() => {
  const live = (G.runs || GW.world?.runs || []).filter(isLive).length
  // Critical alerts only: high ones run into the hundreds and would make the count meaningless.
  const severe = G.alerts
    ? G.alerts.filter(a => a.severity === 'critical').length
    : (GW.world?.repos || []).reduce((n, r) => n + (r.alerts?.critical || 0), 0)
  const items: { id: GhTab; label: string; icon: string; count?: number; hot?: boolean }[] = [
    { id: 'reviews', label: 'Review requests', icon: 'i-hugeicons-user-check-01', count: G.reviews?.length ?? R.prs.length, hot: true },
    { id: 'mine', label: 'My pull requests', icon: 'i-hugeicons-git-pull-request', count: G.mine?.length },
    { id: 'repos', label: 'Repos', icon: 'i-hugeicons-book-02' },
    { id: 'runs', label: 'Workflows', icon: 'i-hugeicons-workflow-square-10', count: live || undefined },
    { id: 'security', label: 'Security', icon: 'i-hugeicons-shield-01', count: severe || undefined, hot: true },
  ]
  return items
})

/** gh itself missing or signed out: nothing here works until that's fixed. */
const problem = computed(() => R.problem || (GW.world?.problem === 'missing' || GW.world?.problem === 'auth' ? GW.world.problem : null))

function copy(text: string) {
  navigator.clipboard.writeText(text).then(() => ui.toast({ title: 'Copied', body: text })).catch(() => {})
}

async function checkAgain() {
  await R.poll()
  await GW.read()
  G.load(G.tab, true)
}

onMounted(() => {
  GW.start()
  G.load(G.tab)
})

onBeforeUnmount(() => GW.stop())
</script>

<template>
  <!-- A click in the content gives it the keyboard, as Enter from the sidebar does. -->
  <div class="relative flex min-h-0 flex-1" @mousedown="($event.target as HTMLElement).closest('nav') || (G.pane = 'main')">
    <nav class="flex w-[196px] flex-none flex-col gap-0.5 border-r border-(--ln) bg-(--chrome) p-2">
      <button
        v-for="n in NAV"
        :key="n.id"
        class="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] hover:bg-(--hov)"
        :class="[G.tab === n.id ? 'bg-(--hov) font-medium text-(--tx)' : 'text-(--tx2)', G.tab === n.id && G.pane === 'nav' && 'ring-1 ring-(--lnk)']"
        @click="G.go(n.id); G.pane = 'nav'"
      >
        <UIcon :name="n.icon" class="size-4 flex-none" :class="G.tab === n.id ? 'text-(--tx)' : 'text-(--mu)'" />
        <span class="ellipsis flex-1">{{ n.label }}</span>
        <span
          v-if="n.count"
          class="mono rounded-lg px-1.5 text-[10.5px] font-bold"
          :class="n.hot ? 'bg-(--ambf) text-[#131417]' : 'bg-(--chip) text-(--tx2)'"
        >{{ n.count }}</span>
      </button>
    </nav>

    <div v-if="problem" class="min-h-0 flex-1 overflow-auto">
      <div class="mx-auto flex max-w-[520px] flex-col gap-4 px-6 py-12">
        <div class="flex flex-col gap-1">
          <span class="text-[15px] font-semibold">{{ problem === 'missing' ? 'The GitHub CLI isn\'t installed' : 'The GitHub CLI isn\'t signed in' }}</span>
          <span class="text-[12px] leading-[1.5] text-(--mu)">Canopy reads your pull requests, workflows and alerts through gh, with its sign-in. Nothing else is needed.</span>
        </div>
        <div v-for="(s, i) in problem === 'missing' ? [{ t: 'Install the GitHub CLI', c: 'winget install --id GitHub.cli' }, { t: 'Sign in to GitHub', c: 'gh auth login' }] : [{ t: 'Sign in to GitHub', c: 'gh auth login' }]" :key="s.c" class="flex flex-col gap-1.5">
          <span class="text-[12.5px] font-medium">{{ i + 1 }}. {{ s.t }}</span>
          <div class="flex items-center gap-2 rounded-md border border-(--ln) bg-(--inp) py-1 pl-2.5 pr-1">
            <span class="mono ellipsis flex-1 select-text text-[12px]">{{ s.c }}</span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-copy-01" title="Copy" @click="copy(s.c)" />
          </div>
        </div>
        <div><UButton size="sm" color="primary" icon="i-hugeicons-refresh" label="Check again" @click="checkAgain" /></div>
      </div>
    </div>

    <GhPullDetail v-else-if="G.pr" :key="G.pr" :url="G.pr" />
    <GhRunDetail v-else-if="G.run" :key="`${G.run.repo}#${G.run.id}`" :repo="G.run.repo" :id="G.run.id" />
    <!-- Back from a PR or run opened here returns to the repo, read again. -->
    <GhRepoDetail v-else-if="G.repo" :key="G.repo" :name="G.repo" />
    <GhRepoList v-else-if="G.tab === 'repos'" />
    <GhPullList
      v-else-if="G.tab === 'reviews' || G.tab === 'mine'"
      :key="G.tab"
      :pulls="G.tab === 'reviews' ? G.reviews : G.mine"
      :title="G.tab === 'reviews' ? 'Waiting for your review' : 'Your open pull requests'"
      :empty="G.tab === 'reviews' ? 'Nobody is waiting for your review.' : 'You have no open pull requests.'"
      :busy="!!G.busy[G.tab]"
      :error="G.errors[G.tab]"
      :oldest-first="G.tab === 'reviews'"
      @refresh="G.load(G.tab, true)"
    />
    <GhRunList v-else-if="G.tab === 'runs'" />
    <GhSecurity v-else-if="G.tab === 'security'" />

    <GhDispatch v-if="G.dispatch" :key="G.dispatch" :repo="G.dispatch" />
  </div>
</template>
