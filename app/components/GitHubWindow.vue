<script setup lang="ts">
// The GitHub window: review requests, PRs, repos, workflows and security over whatever is showing,
// the terminals or the 3D World (see-through there), driven from the keyboard like gh-tui.
import { useEventListener } from '@vueuse/core'
import { comboOf, matchAction } from '#shared/actions'
import { simGlassOf } from '~/stores/prefs'

const ui = useUiStore()
const prefs = usePrefsStore()
const G = useGithubStore()
const GW = useGhWorldStore()

const root = ref<HTMLElement | null>(null)
const glass = computed(() => simGlassOf(prefs.prefs))

const open = computed({
  get: () => ui.gh,
  set: (v: boolean) => {
    if (!v) {
      ui.gh = false
      ui.focusLater()
    }
  },
})

function focusRoot() {
  nextTick(() => root.value?.focus())
}

watch(open, (on) => { if (on) setTimeout(focusRoot, 60) })

/**
 * Esc and Back: a dialog closes first, then a PR, run or repo goes back to its list, then the list
 * hands the keyboard back to the sidebar. Only the toggle (or the close button) closes the window.
 */
function back() {
  const top = ghLayers()[0]
  if (top?.modal && top.keys.ghBack) return top.keys.ghBack.run()
  G.back()
}

/** From the sidebar into the section. */
function enter() {
  G.pane = 'main'
}

/**
 * Keys are read on the whole page while the window is open, so they keep working wherever focus
 * ends up (after a dialog closes, say). Another dialog in front, such as a merge confirmation or
 * Settings, keeps its own keys.
 */
function onKey(e: KeyboardEvent) {
  // The window's own Esc handler and its focus trap's Tab mark those keys handled; other handled keys
  // belong to whatever took them.
  if (!ui.gh || (e.defaultPrevented && e.key !== 'Escape' && e.key !== 'Tab') || ui.confirm || ui.settings || ui.palette || ui.projectModal || ui.lightbox || ui.about || ui.updOpen) return
  const t = e.target as HTMLElement
  // Another dialog has the keyboard to itself: the Esc that just closed a merge confirmation
  // shouldn't go back a screen as well.
  const dialog = t.closest('[role="dialog"]')
  if ((dialog && !dialog.querySelector('[data-gh-root]') && !t.closest('[data-gh-root]'))) return
  const typing = !!t.closest('input:not([type=checkbox]), textarea, select, [contenteditable]')
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (typing) {
      t.blur()
      focusRoot()
    } else back()
    return
  }
  if (typing) return
  const combo = comboOf(e)
  if (!combo) return
  const id = matchAction(prefs.keys, combo, 'github')
  if (!id) return
  // Tab never moves the browser's focus around the window.
  if (id === 'ghNextTab' || id === 'ghPrevTab') e.preventDefault()
  // In the sidebar the arrows pick a section and Enter goes into it. Any other key goes into the
  // section too, so / still searches the repos straight from the sidebar.
  const inDialog = !!ghLayers()[0]?.modal
  if (G.pane === 'nav' && !inDialog) {
    if (id === 'ghDown' || id === 'ghUp') {
      e.preventDefault()
      return G.step(id === 'ghDown' ? 1 : -1)
    }
    if (id === 'ghOpen') {
      e.preventDefault()
      return enter()
    }
    if (id === 'ghBack') return e.preventDefault()
    if (id !== 'ghRefresh') G.pane = 'main'
  }
  for (const l of ghLayers()) {
    const k = l.keys[id]
    if (k) {
      e.preventDefault()
      k.run()
      return
    }
  }
  if (id === 'ghBack') {
    e.preventDefault()
    back()
  } else if (id === 'ghRefresh') {
    e.preventDefault()
    G.load(G.tab, true)
  }
}

useEventListener(window, 'keydown', onKey)

/** The keys the screen in front answers to, for the footer; in the sidebar, the ones to move about it. */
const hints = computed(() => {
  if (G.pane === 'nav' && !ghLayers()[0]?.modal) {
    return [
      { keys: '↑ ↓', hint: 'sections' },
      { keys: 'Enter →', hint: 'go in' },
    ]
  }
  const seen = new Set<string>()
  const out: { keys: string; hint: string }[] = []
  for (const l of ghLayers()) {
    for (const [id, k] of Object.entries(l.keys)) {
      if (!k?.hint || seen.has(k.hint)) continue
      seen.add(k.hint)
      out.push({ keys: prefs.kl(id), hint: k.hint })
    }
  }
  return out
})
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
        data-gh-root
        tabindex="-1"
        class="flex min-h-0 flex-1 flex-col text-(--tx) outline-none"
        :class="ui.sim ? 'sim-glass' : 'bg-(--modal)'"
        :style="ui.sim ? { '--glass': glass + '%' } : undefined"
      >
        <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln) pl-3.5 pr-2">
          <UIcon name="i-hugeicons-github" class="size-4 text-(--tx2)" />
          <span class="text-[13px] font-semibold">GitHub</span>
          <UTooltip v-if="GW.slow" :text="`Fewer than 500 GitHub API calls left this hour, so Canopy reads less until it resets`">
            <span class="rounded-sm bg-(--ambf)/15 px-1.5 py-px text-[11px] text-(--amb)">Rate limit low · slowing down until {{ new Date(GW.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}</span>
          </UTooltip>
          <div class="flex-1" />
          <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('github') }} to close</span>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Close" @click="open = false" />
        </div>
        <GitHubScreens />
        <div class="mono flex h-7 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-t border-(--ln) px-3.5 text-[10.5px] text-(--fa)">
          <span v-for="h in hints" :key="h.hint"><span class="text-(--tx2)">{{ h.keys }}</span> {{ h.hint }}</span>
          <span v-if="G.pane === 'main'"><span class="text-(--tx2)">Esc</span> {{ G.pr || G.run || G.repo ? 'back' : 'sidebar' }}</span>
          <span><span class="text-(--tx2)">{{ prefs.kl('github') }}</span> close</span>
          <div class="flex-1" />
          <span class="cursor-pointer hover:text-(--tx2)" @click="ui.openSettings('keys')">change keys</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
