<script setup lang="ts">
import type { Session } from '#shared/types'

const props = defineProps<{ session: Session; multi: boolean; focused: boolean; narrow: boolean }>()

const ui = useUiStore()
const S = useSessionsStore()
const P = useProjectsStore()
const G = useGitStore()
const prefs = usePrefsStore()

const host = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const s = computed(() => props.session)
const p = computed(() => P.byId(s.value.pid)!)
const r = computed(() => P.repoOf(s.value.pid, s.value.repoId))
const statusC = computed(() => SC[s.value.status])
/** Plain shells show a terminal icon and no Claude-only chips (cost, context, details). */
const isShell = computed(() => s.value.kind === 'shell')
const cost = computed(() => usd(S.cost(s.value)))
const git = computed(() => G.get(s.value.cwd))
const chgN = computed(() => git.value?.changes.length || 0)
const share = computed(() => ui.shareInfo(s.value.id))
const canShare = computed(() => share.value.mine.length > 0 && share.value.others.length > 0)
const shareTo = computed(() => (share.value.others[0] ? P.repoOf(s.value.pid, share.value.others[0].repoId).label : ''))
const branch = computed(() => git.value?.branch || s.value.branch)
const ctx = computed(() => Math.round(s.value.ctx))
const ctxC = computed(() => (s.value.ctx < 50 ? 'var(--grn)' : s.value.ctx < 80 ? 'var(--ambf)' : 'var(--red)'))

const border = computed(() => {
  if (!props.multi) return '0 solid transparent'
  if (props.focused) return `1px solid color-mix(in oklch, ${statusC.value} 70%, transparent)`
  if (s.value.status === 'waiting') return '1px solid color-mix(in oklch, var(--ambf) 45%, transparent)'
  return '1px solid var(--ln)'
})

// ---------- Image strip ----------
const imgsPrompt = computed(() => s.value.images.filter(im => im.pending || im.prompt === s.value.promptCount))
const mode = computed(() => (ui.stripMode === 'prompt' && imgsPrompt.value.length ? 'prompt' : 'session'))
const thumbs = computed(() => (mode.value === 'prompt' ? imgsPrompt.value : s.value.images))
const showStrip = computed(() => ui.stripOn && s.value.images.length > 0)
const stripMode = computed({
  get: () => mode.value,
  set: (v: 'prompt' | 'session') => { ui.stripMode = v },
})
const thumbW = computed(() => (props.narrow ? '78px' : '104px'))
const thumbH = computed(() => (props.narrow ? '48px' : '62px'))

function pickImage() {
  fileInput.value?.click()
}

function onPicked(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) S.addImage(s.value.id, f)
  ;(e.target as HTMLInputElement).value = ''
}

function focusPane() {
  if (S.focusedId(s.value.pid) !== s.value.id) S.setFocus(s.value.pid, s.value.id)
}

function clickFocus() {
  if (!String(window.getSelection?.() || '')) focusTerminal(s.value.id)
}

function openDetails() {
  S.setFocus(s.value.pid, s.value.id)
  ui.details = true
}

function openChanges() {
  S.setFocus(s.value.pid, s.value.id)
  nextTick(() => ui.openExplorer('changes', s.value.repoId))
}

onMounted(() => {
  attachTerminal(s.value.id, host.value!)
  if (props.focused) nextTick(() => focusTerminal(s.value.id))
})

onBeforeUnmount(() => {
  if (host.value) detachTerminal(s.value.id, host.value)
})

watch(() => props.focused, (f) => {
  if (f) nextTick(() => focusTerminal(s.value.id))
})
</script>

<template>
  <div
    class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--term)"
    :class="{ dark: prefs.terminalDark }"
    :style="{ border, borderRadius: multi ? 'var(--radius-lg)' : '0' }"
    @mousedown="focusPane"
  >
    <div v-if="multi" class="flex h-8 flex-none items-center gap-2 border-b border-(--ln2) bg-(--chrome) pl-2.5 pr-2">
      <UIcon v-if="isShell" name="i-hugeicons-command-line" class="size-3.5 flex-none text-(--mu)" />
      <span v-else class="h-[7px] w-[7px] flex-none rounded-full" :style="{ background: statusC }" />
      <span class="mono flex-none rounded-sm bg-(--chip) px-[5px] py-px text-[10.5px] text-(--tx2)">{{ r.label }}</span>
      <span class="ellipsis flex-1 text-[12px] text-(--tx2)">{{ s.title }}</span>
      <UTooltip v-if="canShare" :text="`Draft a prompt in ${shareTo} with this session's changes (${prefs.kl('share')})`">
        <span
          class="box-border flex h-[18px] flex-none cursor-pointer items-center whitespace-nowrap rounded-sm border border-(--bb) px-[7px] text-[10.5px] text-(--tx2) hover:bg-(--hov) hover:text-(--tx)"
          @click.stop="ui.shareChanges(s.id)"
        >Share → {{ shareTo }}</span>
      </UTooltip>
      <UBadge
        v-if="s.status === 'waiting'"
        :label="s.perm ? 'Needs permission' : 'Needs input'"
        :ui="{ base: 'flex-none whitespace-nowrap rounded-sm bg-(--ambf) px-1.5 py-px text-[10.5px] font-semibold text-[#131417] ring-0' }"
      />
      <template v-if="!narrow">
        <UTooltip text="Git branch">
          <span class="mono flex h-[18px] flex-none items-center gap-[5px] whitespace-nowrap rounded-sm px-1.5 text-[10.5px] text-(--vio)" style="background: color-mix(in oklch, var(--vio) 14%, transparent)"><UIcon name="i-hugeicons-git-branch" class="size-3" />{{ branch }}</span>
        </UTooltip>
        <UTooltip v-if="!isShell" text="Session cost (API-equivalent)">
          <span class="mono box-border flex h-[18px] flex-none items-center whitespace-nowrap rounded-sm border border-(--ln) px-1.5 text-[10.5px] text-(--tx)">{{ cost }}</span>
        </UTooltip>
      </template>
      <UTooltip v-if="!isShell" text="Session details">
        <span class="mono box-border grid h-[18px] w-[18px] flex-none cursor-pointer place-items-center rounded-sm border border-(--bb) text-[10px] text-(--tx3) hover:text-(--tx)" @click.stop="openDetails">i</span>
      </UTooltip>
      <UTooltip text="Close session">
        <span class="grid h-[18px] w-[18px] flex-none cursor-pointer place-items-center rounded-sm text-[10px] text-(--fa) hover:bg-(--hov) hover:text-(--tx)" @click.stop="ui.closeSession(s.id)"><UIcon name="i-hugeicons-cancel-01" class="size-2.5" /></span>
      </UTooltip>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden px-2.5 pt-1" @click="clickFocus">
      <div ref="host" class="h-full w-full" />
    </div>

    <div class="mono flex flex-none items-center gap-[5px] overflow-hidden whitespace-nowrap px-3.5 pb-1.5 pt-[5px] text-[12px]">
      <UTooltip text="Repo folder">
        <span class="flex h-[21px] flex-none items-center gap-[5px] rounded-sm px-1.5 text-(--tx2)" :style="{ background: `color-mix(in oklch, ${pcol(p.hue)} 16%, transparent)` }">
          <span class="h-[8px] w-[8px] rounded-xs" :style="{ background: pcol(p.hue) }" />{{ baseName(s.cwd) }}
        </span>
      </UTooltip>
      <UTooltip v-if="s.wt" text="Runs in its own git worktree">
        <span class="flex h-[21px] flex-none items-center gap-1 rounded-sm px-1.5 text-(--teal)" style="background: color-mix(in oklch, var(--teal) 15%, transparent)"><UIcon name="i-hugeicons-git-fork" class="size-3" />worktree</span>
      </UTooltip>
      <UTooltip text="Git branch">
        <span class="flex h-[21px] flex-none items-center gap-[5px] rounded-sm px-1.5 text-(--vio)" style="background: color-mix(in oklch, var(--vio) 14%, transparent)"><UIcon name="i-hugeicons-git-branch" class="size-3" />{{ branch }}</span>
      </UTooltip>
      <UTooltip v-if="chgN" :text="`Uncommitted changes · click to open (${prefs.kl('files')})`">
        <span
          class="flex h-[21px] flex-none cursor-pointer items-center gap-1 rounded-sm px-1.5 text-(--amb) [background:color-mix(in_oklch,var(--ambf)_16%,transparent)] hover:[background:color-mix(in_oklch,var(--ambf)_28%,transparent)]"
          @click.stop="openChanges"
        >±{{ chgN }} changed</span>
      </UTooltip>
      <UTooltip v-if="s.model" text="Model">
        <span class="flex h-[21px] flex-none items-center rounded-sm px-1.5 text-(--cyan)" style="background: color-mix(in oklch, var(--cyan) 14%, transparent)">{{ s.model }}</span>
      </UTooltip>
      <UTooltip v-if="!isShell" text="Context window used">
        <span class="flex h-[21px] flex-none items-center gap-1.5 rounded-sm bg-(--chip) px-1.5 text-(--tx3)">
          ctx<UProgress :model-value="ctx" :max="100" :ui="{ root: 'w-8 gap-0', base: 'h-1 rounded-xs bg-(--trk)', indicator: 'rounded-xs' }" :style="{ '--ui-primary': ctxC }" />
          <span :style="{ color: s.ctx < 80 ? 'var(--tx3)' : 'var(--red)' }">{{ ctx }}%</span>
        </span>
      </UTooltip>
      <UTooltip v-if="!isShell" text="Session cost (API-equivalent)">
        <span class="box-border flex h-[21px] flex-none items-center rounded-sm border border-(--ln) px-1.5 text-(--tx)">{{ cost }}</span>
      </UTooltip>
    </div>

    <div v-if="showStrip" class="flex flex-none flex-col gap-[7px] border-t border-(--ln2) bg-(--head) px-2.5 pb-2.5 pt-2">
      <div class="flex items-center gap-2.5 text-[11.5px]">
        <span class="font-medium text-(--tx2)">Images</span>
        <Seg
          v-model="stripMode"
          size="sm"
          :items="[
            { label: `Last prompt · ${imgsPrompt.length}`, value: 'prompt' },
            { label: `Session · ${s.images.length}`, value: 'session' },
          ]"
        />
        <div class="flex-1" />
        <UTooltip :text="`Hide (${prefs.kl('strip')})`">
          <span class="cursor-pointer whitespace-nowrap text-[10.5px] text-(--fa) hover:text-(--tx2)" @click.stop="ui.stripOn = false"><span class="flex items-center gap-1">Hide<UIcon name="i-hugeicons-arrow-down-01" class="size-3" /></span></span>
        </UTooltip>
      </div>
      <div class="flex gap-2 overflow-x-auto">
        <div
          v-for="im in thumbs"
          :key="im.n + im.name"
          :title="im.name"
          class="thumb-bg relative box-border flex-none cursor-zoom-in overflow-hidden rounded-md border hover:border-(--mu)"
          :style="{ width: thumbW, height: thumbH, borderColor: im.pending ? 'color-mix(in oklch, var(--lnk) 70%, transparent)' : 'var(--ln)' }"
          @click.stop="ui.openLightbox(s.id, im.n)"
        >
          <div class="absolute inset-0 bg-cover bg-center" :style="{ backgroundImage: im.src ? `url(${im.src})` : 'none' }" />
          <span class="mono absolute bottom-1 left-1 rounded-xs bg-[rgba(11,12,14,0.85)] px-1 text-[10px] text-[#E4E5E8]">#{{ im.n }}</span>
          <template v-if="im.pending">
            <span class="absolute bottom-1 right-1 rounded-sm bg-(--lnk) px-[5px] text-[9.5px] font-semibold text-[#131417]">pending</span>
            <span
              title="Remove from prompt"
              class="absolute right-[3px] top-[3px] grid h-4 w-4 cursor-pointer place-items-center rounded-sm bg-[rgba(11,12,14,0.85)] text-[9px] text-[#E4E5E8] hover:bg-(--red)"
              @click.stop="S.removeImage(s.id, im.n)"
            ><UIcon name="i-hugeicons-cancel-01" class="size-2.5" /></span>
          </template>
        </div>
        <UTooltip text="Paste with Ctrl V, or click to add an image">
          <div
            class="box-border grid flex-none cursor-pointer place-items-center rounded-md border border-dashed border-(--bb) text-[16px] text-(--fa) hover:border-(--mu) hover:text-(--tx2)"
            :style="{ width: thumbH, height: thumbH }"
            @click.stop="pickImage"
          >+</div>
        </UTooltip>
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onPicked">
      </div>
    </div>
  </div>
</template>
