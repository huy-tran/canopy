<script setup lang="ts">
// Font picker for the terminal (bundled coding fonts, then installed monospace fonts, Nerd Fonts first) or the app (any font), or any typed name.
import { TERM_FONTS } from '#shared/fonts'
import { DEFAULT_PREFS } from '~/stores/prefs'

type Font = { name: string; nerd: boolean; mono: boolean }
type Entry = (Font & { class?: string }) | { type: 'label'; name: string }

const props = withDefaults(defineProps<{ kind?: 'term' | 'app' }>(), { kind: 'term' })

const prefs = usePrefsStore()
const open = ref(false)
const fonts = useState<Font[] | null>('canopy-fonts', () => null)

onMounted(() => {
  if (fonts.value) return
  api.sys.fonts().then((f) => { fonts.value = f || [] }).catch(() => { fonts.value = [] })
})

const isTerm = computed(() => props.kind === 'term')
const key = computed(() => (isTerm.value ? 'termFont' : 'appFont') as 'termFont' | 'appFont')
const css = (n: string) => `'${n.replace(/['";]/g, '')}',${isTerm.value ? "'JetBrains Mono',monospace" : 'system-ui,sans-serif'}`
const PREVIEW = computed(() => (isTerm.value ? 'AaBb 0O 1lI {} => !=' : 'The quick brown fox 0123'))
/** Bundled with the app, so always available. */
const BUNDLED: Font[] = [{ name: 'Outfit', nerd: false, mono: false }]
const BUNDLED_TERM: Font[] = TERM_FONTS.map(f => ({ name: f.name, nerd: false, mono: true }))

const current = computed(() => prefs.prefs[key.value] || DEFAULT_PREFS[key.value])
const isNerd = computed(() => isTerm.value && (fonts.value?.find(f => f.name === current.value)?.nerd ?? /nerd font/i.test(current.value)))

const items = computed<Entry[][]>(() => {
  const all = fonts.value || []
  const mark = (f: Font) => ({ ...f, class: f.name === current.value ? 'before:bg-(--sel)' : undefined })
  const label = (name: string, list: Font[]) => (list.length ? [{ type: 'label' as const, name }, ...list.map(mark)] : [])
  if (isTerm.value) {
    const mono = all.filter(f => f.mono && !BUNDLED_TERM.some(b => b.name === f.name))
    return [
      label('Bundled with Canopy', BUNDLED_TERM),
      label('Installed Nerd Fonts', mono.filter(f => f.nerd)),
      label('Other installed monospace fonts', mono.filter(f => !f.nerd)),
    ].filter(g => g.length)
  }
  const installed = all.filter(f => !BUNDLED.some(b => b.name === f.name))
  return [label('Bundled with Canopy', BUNDLED), label('Installed fonts', installed)].filter(g => g.length)
})

function pick(name: string) {
  const n = name.trim()
  if (n) prefs.set({ [key.value]: n })
  open.value = false
}
</script>

<template>
  <USelectMenu
    v-model:open="open"
    :model-value="current"
    :items="items"
    value-key="name"
    label-key="name"
    variant="none"
    :create-item="{ when: 'always', position: 'bottom' }"
    :search-input="{
      placeholder: 'Search fonts or type any name',
      icon: 'i-hugeicons-search-01',
      ui: {
        root: 'w-full border-b border-(--ln)',
        base: 'h-[36px] ps-[30px] pe-[10px] py-0 text-[12.5px] text-(--tx) bg-transparent',
        leading: 'ps-[10px]',
        leadingIcon: 'size-3 text-(--fa)',
      },
    }"
    :content="{ align: 'end', sideOffset: 4 }"
    :ui="{
      base: `w-[280px] max-w-full h-[30px] px-[10px] py-0 gap-2 bg-(--inp) border rounded-md cursor-pointer hover:border-(--mu) ${open ? 'border-(--mu)' : 'border-(--ln)'}`,
      trailing: 'static inset-auto p-0 flex items-center gap-2',
      content: 'w-[340px] max-w-[calc(100vw-48px)] max-h-[min(360px,var(--reka-combobox-content-available-height,360px))] bg-(--modal) ring-0 border border-(--bb) rounded-lg shadow-(--shadow)',
      input: 'border-b-0',
      viewport: 'p-[4px] divide-y-0',
      group: 'p-0',
      label: 'label-caps px-[8px] pt-[8px] pb-[4px] text-[10.5px] text-(--mu) font-semibold',
      item: 'px-[8px] py-[5px] gap-[10px] items-center rounded-md cursor-pointer before:inset-0 before:rounded-md data-highlighted:not-data-disabled:before:bg-(--hov)',
      empty: 'pt-[10px] pb-[4px] pe-[8px] ps-[30px] text-left text-[12px] text-(--fa)',
    }"
    @update:model-value="(v: any) => pick(String(v))"
    @create="pick"
  >
    <span class="ellipsis flex-1 text-left text-[12.5px] text-(--tx)" :style="{ fontFamily: css(current) }">{{ current }}</span>

    <template #trailing>
      <UBadge
        v-if="isNerd"
        variant="outline"
        color="neutral"
        :ui="{ base: 'h-auto px-[5px] py-0 rounded-sm text-[10px] font-normal text-(--grn) ring-0 border border-(--ln) whitespace-nowrap' }"
      >
        Nerd Font
      </UBadge>
      <UIcon name="i-hugeicons-arrow-down-01" class="size-3 text-(--fa)" />
    </template>

    <template #item="{ item }">
      <div class="flex w-full min-w-0 items-center gap-[10px]">
        <span class="w-3 flex-none text-(--grn)"><UIcon v-if="(item as Font).name === current" name="i-hugeicons-tick-02" class="size-3" /></span>
        <div class="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span class="text-[12.5px] text-(--tx)">{{ (item as Font).name }}</span>
          <span class="ellipsis text-[12px] text-(--tx3)" :style="{ fontFamily: css((item as Font).name) }">{{ PREVIEW }}</span>
        </div>
      </div>
    </template>

    <template #create-item-label="{ item }">
      <span class="block py-[3px] ps-[22px] text-[12.5px] text-(--lnk)">Use “{{ item }}”</span>
    </template>

    <template #empty>
      No installed font matches.
    </template>

    <template v-if="isTerm" #content-bottom>
      <div class="border-t border-(--ln) px-3 py-2 text-[11px] leading-[1.45] text-(--fa)">Status line icons show with every font: Canopy includes the Nerd Font symbols.</div>
    </template>
  </USelectMenu>
</template>
