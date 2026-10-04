<script setup lang="ts">
// Commit, push and pull request for one working folder, under the explorer's Changes list.
import type { GitChange, GitSync } from '#shared/types'

const props = defineProps<{ cwd: string; changes: GitChange[] }>()

const ui = useUiStore()
const G = useGitStore()

const message = ref('')
const busy = ref<'' | 'draft' | 'commit' | 'push' | 'pr'>('')
const sync = ref<GitSync | null>(null)

const staged = computed(() => props.changes.filter(c => c.staged))
const commitLabel = computed(() => (staged.value.length ? `Commit ${staged.value.length} staged` : `Commit all ${props.changes.length}`))
const canCommit = computed(() => !!message.value.trim() && props.changes.length > 0 && !busy.value)
const canPush = computed(() => !!sync.value?.remote && (!sync.value.upstream || sync.value.ahead > 0) && !busy.value)

async function loadSync() {
  sync.value = props.cwd ? await api.git.sync(props.cwd).catch(() => null) : null
}

watch(() => props.cwd, () => {
  message.value = ''
  loadSync()
}, { immediate: true })

function fail(title: string, error?: string) {
  ui.toast({ title, body: error, error: true })
}

async function draft() {
  busy.value = 'draft'
  try {
    const r = await api.git.draftMessage(props.cwd)
    if (r.ok) message.value = r.text
    else fail('Could not draft a message', r.error)
  } finally {
    busy.value = ''
  }
}

async function commit() {
  if (!canCommit.value) return
  busy.value = 'commit'
  try {
    const r = await api.git.commit(props.cwd, message.value.trim(), !staged.value.length)
    if (!r.ok) return fail('Commit failed', r.error)
    message.value = ''
    ui.toast({ title: 'Committed', body: sync.value?.branch ? `On ${sync.value.branch}` : undefined })
    await Promise.all([G.refresh(props.cwd), loadSync()])
  } finally {
    busy.value = ''
  }
}

async function push() {
  busy.value = 'push'
  try {
    const r = await api.git.push(props.cwd)
    if (!r.ok) return fail('Push failed', r.error)
    ui.toast({ title: 'Pushed', body: sync.value?.branch })
    await loadSync()
  } finally {
    busy.value = ''
  }
}

async function pullRequest() {
  busy.value = 'pr'
  try {
    // A pull request needs the branch on the remote first.
    if (sync.value && (!sync.value.upstream || sync.value.ahead > 0)) {
      const r = await api.git.push(props.cwd)
      if (!r.ok) return fail('Push failed', r.error)
      await loadSync()
    }
    const r = await api.git.prUrl(props.cwd)
    if (r.ok && r.url) api.sys.openExternal(r.url)
    else fail('Could not open a pull request', r.error)
  } finally {
    busy.value = ''
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault()
    commit()
  }
  // Keep the explorer's own keys (arrows, Tab, Enter) from acting while typing a message.
  e.stopPropagation()
}

const syncText = computed(() => {
  const s = sync.value
  if (!s?.branch) return ''
  if (!s.remote) return 'No remote'
  if (!s.upstream) return 'Not pushed yet'
  return s.ahead || s.behind ? `${s.ahead} to push · ${s.behind} to pull` : 'Up to date'
})
</script>

<template>
  <div class="flex flex-none flex-col gap-2 border-t border-(--ln) px-3 py-2.5" @mousedown.stop>
    <div class="flex items-center gap-2 text-[11.5px]">
      <span v-if="sync?.branch" class="mono flex min-w-0 items-center gap-1 text-(--vio)">
        <UIcon name="i-hugeicons-git-branch" class="size-3 flex-none" /><span class="ellipsis">{{ sync.branch }}</span>
      </span>
      <span class="ellipsis flex-1 text-(--fa)">{{ syncText }}</span>
      <UTooltip :text="sync?.upstream ? 'Push commits to the remote' : 'Push this branch to origin'">
        <UButton color="neutral" variant="outline" size="xs" class="h-[22px] px-2 text-[11px]" :loading="busy === 'push'" :disabled="!canPush" @click="push">
          Push
        </UButton>
      </UTooltip>
      <UTooltip text="Push if needed, then open the pull request page in your browser">
        <UButton color="neutral" variant="outline" size="xs" class="h-[22px] px-2 text-[11px]" :loading="busy === 'pr'" :disabled="!sync?.remote || !!busy" @click="pullRequest">
          Create PR
        </UButton>
      </UTooltip>
    </div>
    <UTextarea
      v-model="message"
      :rows="2"
      autoresize
      :maxrows="6"
      variant="none"
      placeholder="Commit message"
      :ui="{ base: 'w-full rounded-md border border-(--ln) bg-(--inp) px-2.5 py-1.5 text-[12px] leading-[1.5] text-(--tx) placeholder:text-(--fa)' }"
      @keydown="onKey"
    />
    <div class="flex items-center gap-2">
      <UTooltip text="Claude writes a message from the diff">
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-hugeicons-magic-wand-01"
          class="h-6 px-2 text-[11.5px]"
          :loading="busy === 'draft'"
          :disabled="!changes.length || !!busy"
          @click="draft"
        >
          Draft with Claude
        </UButton>
      </UTooltip>
      <div class="flex-1" />
      <UButton color="primary" size="xs" class="h-6 gap-2 px-2.5 text-[11.5px]" :loading="busy === 'commit'" :disabled="!canCommit" @click="commit">
        {{ commitLabel }}<UKbd class="h-auto bg-transparent px-0 text-[10px] text-(--invtx) opacity-60 ring-0">Ctrl Enter</UKbd>
      </UButton>
    </div>
  </div>
</template>
