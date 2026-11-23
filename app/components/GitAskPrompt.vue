<script setup lang="ts">
// A push started outside the file explorer (opening a pull request from a worktree) asks for a key's passphrase here.
// The explorer's commit panel answers for its own pushes.
import type { GitAsk } from '#shared/bridge'

const ui = useUiStore()
const ask = ref<GitAsk | null>(null)
const secret = ref('')
const input = ref<{ inputRef?: HTMLInputElement | null } | null>(null)

const off = api.git.onAsk((q) => {
  if (q.cwd !== ui.pushCwd) return
  ask.value = q
  secret.value = ''
  nextTick(() => input.value?.inputRef?.focus())
})
onBeforeUnmount(() => {
  off()
  if (ask.value) api.git.answer(ask.value.id, null)
})

function answer(ok: boolean) {
  const q = ask.value
  if (!q) return
  const s = secret.value
  ask.value = null
  secret.value = ''
  api.git.answer(q.id, ok ? s : null)
}

const open = computed({
  get: () => !!ask.value,
  set: (v: boolean) => { if (!v) answer(false) },
})
</script>

<template>
  <UModal
    v-model:open="open"
    :close="false"
    title="Push"
    description="The push needs a secret"
    :ui="{ overlay: 'bg-(--ovl) z-[70]', content: 'z-[70] w-full max-w-[400px] bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0' }"
  >
    <template #content>
      <div v-if="ask" class="flex flex-col gap-3 p-4 text-(--tx)">
        <span class="text-[13px] font-semibold">{{ ask.kind === 'passphrase' ? 'Key passphrase' : 'Password' }} needed to push</span>
        <span class="mono text-[11.5px] break-all text-(--mu)">{{ ask.label }}</span>
        <UInput
          ref="input"
          v-model="secret"
          type="password"
          autocomplete="off"
          :placeholder="ask.kind === 'passphrase' ? 'Key passphrase' : 'Password'"
          @keydown.enter.prevent.stop="answer(true)"
          @keydown.esc.prevent.stop="answer(false)"
        />
        <div class="flex justify-end gap-1.5">
          <UButton color="neutral" variant="ghost" size="sm" label="Cancel push" @click="answer(false)" />
          <UButton color="primary" size="sm" label="Continue" @click="answer(true)" />
        </div>
      </div>
    </template>
  </UModal>
</template>
