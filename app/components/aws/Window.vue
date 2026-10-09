<script setup lang="ts">
// The AWS window: aws-tui over whatever is showing, the terminals or the 3D World (see-through there),
// driven from the keyboard with aws-tui's keys. Its header carries the profile and region, which a
// click or a key switches, and a dry-run badge while changes only go to the audit log.
import { useEventListener } from '@vueuse/core'
import { comboOf, matchAction, matchActions } from '#shared/actions'
import { simGlassOf } from '~/stores/prefs'

const ui = useUiStore()
const prefs = usePrefsStore()
const A = useAwsStore()
const AW = useAwsWorldStore()

const root = ref<HTMLElement | null>(null)
const glass = computed(() => simGlassOf(prefs.prefs))

const open = computed({
  get: () => ui.aws,
  set: (v: boolean) => {
    if (!v) {
      ui.aws = false
      ui.focusLater()
    }
  },
})

function focusRoot() {
  nextTick(() => root.value?.focus())
}

watch(open, (on) => {
  if (!on) return
  setTimeout(focusRoot, 60)
  A.checkLock()
})

/**
 * Esc and Back: a dialog closes first, then the screen in front goes back a step, and from a
 * service's main list the keyboard goes out to the sidebar. Only the toggle closes the window.
 */
function back() {
  if (A.choice) return (A.choice = null)
  for (const l of awsLayers()) {
    const k = l.keys.awsBack
    if (k) return k.run()
    if (l.modal) return
  }
  A.pane = 'nav'
}

/** Keys that work anywhere in the window unless a dialog has them. */
const GLOBAL: Record<string, () => void> = {
  awsBack: back,
  awsNextTab: () => A.step(1),
  awsPrevTab: () => A.step(-1),
  awsFinder: () => { if (A.ctx && A.lock?.unlocked) A.finder = true },
  awsProfile: () => { A.picker = 'profile' },
  awsRegion: () => { if (A.profile) A.picker = 'region' },
  awsLock: () => A.lockNow(),
  awsBookmarks: () => { if (A.ctx) A.bookmarksOpen = true },
  awsHelp: () => { A.help = !A.help },
  awsDetach: () => { A.term = null; focusRoot() },
}

/**
 * Keys are read on the whole page while the window is open, so they keep working wherever focus
 * ends up. Another Canopy dialog in front keeps its own keys, and a terminal keeps every key but the
 * one that leaves it.
 */
function onKey(e: KeyboardEvent) {
  if (!ui.aws || ui.confirm || ui.settings || ui.palette || ui.projectModal || ui.lightbox || ui.about || ui.updOpen) return
  const combo = comboOf(e)
  // An app-wide shortcut (Ctrl+K opens the command palette) is marked handled even though it does
  // nothing while this window is open; the window's own use of the key still counts.
  const app = matchAction(prefs.keys, combo)
  const appIdle = !!app && app !== 'aws' && app !== 'quit'
  if (e.defaultPrevented && e.key !== 'Escape' && e.key !== 'Tab' && !appIdle) return
  const t = e.target as HTMLElement
  const dialog = t.closest('[role="dialog"]')
  if (dialog && !dialog.querySelector('[data-aws-root]') && !t.closest('[data-aws-root]')) return
  if (t.closest('.xterm')) {
    if (combo && matchActions(prefs.keys, combo, 'aws').includes('awsDetach')) {
      e.preventDefault()
      GLOBAL.awsDetach!()
    }
    return
  }
  const typing = !!t.closest('input:not([type=checkbox]), textarea, select, [contenteditable]')
  // A one-key choice waiting: the next key picks, Esc cancels.
  if (A.choice && !typing) {
    if (!combo) return
    e.preventDefault()
    e.stopPropagation()
    const c = A.choice
    A.choice = null
    if (e.key === 'Escape') return
    const k = e.key.toLowerCase()
    c.options.find(o => o.key === k || o.alt === k)?.run()
    return
  }
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
  const ids = matchActions(prefs.keys, combo, 'aws')
  if (!ids.length) return
  if (ids.includes('awsNextTab') || ids.includes('awsPrevTab')) e.preventDefault()
  const layers = awsLayers()
  // In the sidebar, as in the GitHub window: the arrows pick a service and Enter or → goes into it.
  // Any other key goes into the service too, so / still filters straight from the sidebar.
  const inDialog = !!layers[0]?.modal
  if (A.pane === 'nav' && !inDialog && A.lock?.unlocked && A.ctx) {
    e.preventDefault()
    if (ids.includes('awsDown') || ids.includes('awsUp')) return A.stepNav(ids.includes('awsDown') ? 1 : -1)
    if (ids.includes('awsOpen')) {
      A.pane = 'main'
      return
    }
    if (ids.includes('awsBack')) return
    if (!ids.includes('awsRefresh') && !ids.some(id => GLOBAL[id])) A.pane = 'main'
  }
  for (const l of layers) {
    for (const id of ids) {
      const k = l.keys[id]
      if (k) {
        e.preventDefault()
        k.run()
        return
      }
    }
    if (l.modal) return
  }
  const g = ids.find(id => GLOBAL[id])
  if (g) {
    e.preventDefault()
    GLOBAL[g]!()
  }
}

useEventListener(window, 'keydown', onKey)

/** The keys the screen in front answers to, for the footer; in the sidebar, the ones to move about it. */
const hints = computed(() => {
  if (A.pane === 'nav' && !awsLayers()[0]?.modal && A.lock?.unlocked && A.ctx) {
    return [
      { keys: '↑ ↓', hint: 'services' },
      { keys: 'Enter →', hint: 'go in' },
    ]
  }
  const seen = new Set<string>()
  const out: { keys: string; hint: string }[] = []
  for (const l of awsLayers()) {
    for (const [id, k] of Object.entries(l.keys)) {
      if (!k?.hint || seen.has(k.hint)) continue
      seen.add(k.hint)
      out.push({ keys: prefs.kl(id), hint: k.hint })
    }
    if (l.modal) break
  }
  return out
})

const until = computed(() => (A.lock?.until ? new Date(A.lock.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''))
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
        data-aws-root
        tabindex="-1"
        class="relative flex min-h-0 flex-1 flex-col text-(--tx) outline-none"
        :class="ui.sim ? 'sim-glass' : 'bg-(--modal)'"
        :style="ui.sim ? { '--glass': glass + '%' } : undefined"
      >
        <div class="flex h-10 flex-none items-center gap-2 border-b border-(--ln) pl-3.5 pr-2">
          <UIcon name="i-hugeicons-cloud-server" class="size-4 text-(--tx2)" />
          <span class="text-[13px] font-semibold">AWS</span>
          <template v-if="A.lock?.unlocked">
            <button
              v-if="A.profile"
              class="cursor-pointer rounded-sm px-1.5 py-px text-[11.5px] font-semibold text-white hover:opacity-90"
              :style="{ background: profileColor(A.profile) }"
              :title="`Switch profile (${prefs.kl('awsProfile')})`"
              @click="A.picker = 'profile'"
            >{{ A.profile }}</button>
            <button
              v-if="A.region"
              class="mono cursor-pointer rounded-sm bg-(--chip) px-1.5 py-px text-[11px] text-(--tx2) hover:text-(--tx)"
              :title="`Switch region (${prefs.kl('awsRegion')})`"
              @click="A.picker = 'region'"
            >{{ A.region }}</button>
            <span class="text-[12px] text-(--mu)">{{ A.term ? A.terms.find(t => t.id === A.term)?.title : A.tab }}</span>
          </template>
          <UTooltip v-if="A.lock?.dryRun" :text="A.lock.dryRunFrom === 'env' ? 'AWS_TUI_DRY_RUN is set: changes are only written to the audit log' : 'Dry run is on in Settings › AWS: changes are only written to the audit log'">
            <span class="rounded-sm bg-(--ambf)/20 px-1.5 py-px text-[11px] font-semibold text-(--amb)">DRY RUN</span>
          </UTooltip>
          <span v-if="A.ssoExpired" class="flex items-center gap-1.5 rounded-sm bg-(--red)/15 px-1.5 py-px text-[11px] text-(--red)">
            SSO sign-in ran out
            <button class="cursor-pointer underline" @click="A.signIn()">Sign in</button>
          </span>
          <div class="flex-1" />
          <UTooltip v-if="A.lock?.unlocked && until" :text="`Unlocked until ${until}. ${prefs.kl('awsLock')} locks it now, here and in aws-tui.`">
            <button class="flex cursor-pointer items-center gap-1 text-[10.5px] text-(--fa) hover:text-(--tx2)" @click="A.lockNow()">
              <UIcon name="i-hugeicons-lock-key" class="size-3.5" />until {{ until }}
            </button>
          </UTooltip>
          <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('aws') }} to close</span>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-hugeicons-cancel-01" title="Close" @click="open = false" />
        </div>
        <AwsScreens />
        <div v-if="A.choice" class="mono flex h-8 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-t border-(--lnk)/40 bg-(--hov) px-3.5 text-[11px]">
          <span class="font-semibold text-(--tx)">{{ A.choice.title }}:</span>
          <span v-for="o in A.choice.options" :key="o.key"><span class="text-(--lnk)">[{{ o.key }}]</span> <span class="text-(--tx2)">{{ o.label }}</span></span>
          <div class="flex-1" />
          <span class="text-(--fa)">Esc cancels</span>
        </div>
        <div class="mono flex h-7 flex-none items-center gap-3 overflow-hidden whitespace-nowrap border-t border-(--ln) px-3.5 text-[10.5px] text-(--fa)">
          <span v-for="h in hints" :key="h.hint"><span class="text-(--tx2)">{{ h.keys }}</span> {{ h.hint }}</span>
          <span v-if="A.pane === 'main'"><span class="text-(--tx2)">Esc</span> {{ A.term ? 'back' : 'back, then sidebar' }}</span>
          <span><span class="text-(--tx2)">{{ prefs.kl('awsHelp') }}</span> all keys</span>
          <div class="flex-1" />
          <span v-if="AW.loading" class="text-(--fa)">reading…</span>
          <span class="cursor-pointer hover:text-(--tx2)" @click="ui.openSettings('keys')">change keys</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
