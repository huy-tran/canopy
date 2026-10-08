<script setup lang="ts">
// Asks before a bulk action such as closing every terminal. Enter confirms, Esc cancels.
const ui = useUiStore()

const open = computed({
  get: () => !!ui.confirm,
  set: (v: boolean) => {
    if (!v) {
      ui.confirm = null
      ui.focusLater()
    }
  },
})

function ok() {
  const c = ui.confirm
  ui.confirm = null
  c?.run()
}
</script>

<template>
  <UModal
    v-model:open="open"
    :close="false"
    :ui="{
      overlay: 'bg-(--ovl) place-items-[start_center] p-[64px_16px] sm:p-[64px_16px]',
      content: 'w-full max-w-[380px] gap-3 px-5 pt-5 pb-4 bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0 text-(--tx)',
    }"
  >
    <template #content>
      <div class="flex flex-col gap-1">
        <span class="text-[14px] font-semibold">{{ ui.confirm?.title }}</span>
        <span class="text-[12.5px] leading-[1.5] text-(--tx3)">{{ ui.confirm?.body }}</span>
      </div>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" class="h-[28px] px-3 text-[12px]" label="Cancel" @click="open = false" />
        <UButton
          autofocus
          color="error"
          variant="solid"
          class="h-[28px] rounded-md bg-(--red) px-3 text-[12px] font-semibold text-white hover:bg-(--red) hover:opacity-90"
          :label="ui.confirm?.ok"
          @click="ok"
        />
      </div>
    </template>
  </UModal>
</template>
