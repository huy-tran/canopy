<script setup lang="ts" generic="T extends string | number">
// Segmented control (the design's pill group), built on UTabs.
const props = withDefaults(defineProps<{
  items: { label: string; value: T; title?: string; hint?: string | number }[]
  size?: 'sm' | 'md' | 'lg'
  mono?: boolean
}>(), { size: 'md', mono: false })

const model = defineModel<T>({ required: true })

const value = computed({
  get: () => String(model.value),
  set: (v: string) => {
    const it = props.items.find(i => String(i.value) === v)
    if (it) model.value = it.value
  },
})

const H = { sm: 'h-[18px] px-[7px] text-[11px]', md: 'h-5 px-[9px] text-[11.5px]', lg: 'h-[22px] px-2.5 text-[11.5px]' }
</script>

<template>
  <UTabs
    v-model="value"
    :items="items.map(i => ({ label: i.label, value: String(i.value), title: i.title, hint: i.hint }))"
    :content="false"
    variant="pill"
    :ui="{
      root: 'flex-none gap-0',
      list: 'p-[2px] gap-[2px] bg-(--seg) border border-(--ln) rounded-lg w-auto',
      indicator: 'rounded-sm bg-(--segon) shadow-none',
      trigger: `${H[size]} ${mono ? 'mono' : ''} grow-0 rounded-sm font-normal cursor-pointer whitespace-nowrap data-[state=inactive]:text-(--mu) data-[state=active]:text-(--tx) hover:data-[state=inactive]:not-disabled:text-(--tx2)`,
      label: 'overflow-visible',
    }"
  >
    <template #default="{ item }">
      <span :title="(item as any).title">{{ item.label }}</span>
      <span v-if="(item as any).hint != null" class="mono ml-1.5 text-[10.5px] text-(--fa)">{{ (item as any).hint }}</span>
    </template>
  </UTabs>
</template>
