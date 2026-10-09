<script setup lang="ts">
// Lines of output, terminal style: log events, console output, a Beanstalk environment's events.
// Levels are coloured, JSON can be pretty-printed, and a find highlights its matches with the
// current one scrolled into view.
import type { AwsLine } from '~/utils/aws'

const props = defineProps<{
  lines: AwsLine[]
  json?: boolean
  find?: string
  /** Which match is the current one. */
  at?: number
  /** Keep the bottom in view as lines arrive, unless scrolled up. */
  follow?: boolean
  empty?: string
  /** How wide the tag column is: a stream name needs more room than a severity. */
  tagWidth?: string
}>()

const box = ref<HTMLElement | null>(null)

const LEVEL: [RegExp, string][] = [
  [/\b(ERROR|FATAL|PANIC|CRITICAL|Exception)\b/, 'var(--red)'],
  [/\b(WARN|WARNING)\b/, 'var(--amb)'],
  [/\bINFO\b/, 'var(--grn)'],
  [/\b(DEBUG|TRACE)\b/, 'var(--fa)'],
]

function pretty(text: string) {
  if (!props.json) return text
  const t = text.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return text
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return text
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Each line as HTML: the level word coloured, find matches marked. */
const rendered = computed(() => {
  const q = props.find?.trim()
  const re = q ? new RegExp(reEsc(q), 'gi') : null
  let n = 0
  return props.lines.map((l) => {
    const text = pretty(l.text)
    const color = LEVEL.find(([r]) => r.test(text))?.[1]
    let html = esc(text)
    let first = -1
    if (re) {
      html = html.replace(new RegExp(reEsc(esc(q!)), 'gi'), (m) => {
        const i = n++
        if (first < 0) first = i
        return `<mark data-m="${i}" class="${i === props.at ? 'cur' : ''}">${m}</mark>`
      })
    }
    return { l, html, color, first }
  })
})

/** How many matches there are, for "match 3/12". */
const count = computed(() => {
  const q = props.find?.trim()
  if (!q) return 0
  const re = new RegExp(reEsc(q), 'gi')
  return props.lines.reduce((a, l) => a + (pretty(l.text).match(re)?.length || 0), 0)
})

watch(() => [props.at, props.find], () => nextTick(() => box.value?.querySelector('mark.cur')?.scrollIntoView({ block: 'center' })))

let stuck = true
function onScroll() {
  const b = box.value
  if (b) stuck = b.scrollHeight - b.scrollTop - b.clientHeight < 40
}
watch(() => props.lines.length, () => {
  if (props.follow && stuck) nextTick(() => { if (box.value) box.value.scrollTop = box.value.scrollHeight })
})
onMounted(() => { if (props.follow && box.value) box.value.scrollTop = box.value.scrollHeight })

/** Scrolls by a page or to an end, for the window's keys. */
function scroll(how: 'down' | 'up' | 'pageDown' | 'pageUp' | 'top' | 'bottom') {
  const b = box.value
  if (!b) return
  const page = b.clientHeight * 0.9
  const by = { down: 40, up: -40, pageDown: page, pageUp: -page, top: -b.scrollHeight, bottom: b.scrollHeight }[how]
  b.scrollBy({ top: by })
}
defineExpose({ count, box, scroll })
</script>

<template>
  <div ref="box" class="aws-lines mono min-h-0 min-w-0 flex-1 select-text overflow-auto bg-(--term) py-2 text-[11.5px] leading-[1.55]" @scroll="onScroll">
    <div v-if="!lines.length" class="px-4 text-(--fa)">{{ empty || 'Nothing to show.' }}</div>
    <div v-for="(r, i) in rendered" :key="i" class="flex gap-2 px-4 hover:bg-(--hov)/40">
      <span v-if="r.l.pre" class="flex-none text-(--fa)">{{ r.l.pre }}</span>
      <span v-if="r.l.tag" class="flex-none truncate" :style="{ color: r.l.tagColor || 'var(--mu)', width: tagWidth || '9.5em' }" :title="r.l.tag">{{ r.l.tag }}</span>
      <span class="min-w-0 flex-1 whitespace-pre-wrap text-(--ttx) [overflow-wrap:anywhere]" :style="r.color ? { color: r.color } : undefined" v-html="r.html" />
    </div>
  </div>
</template>

<style scoped>
.aws-lines :deep(mark) {
  background: color-mix(in oklch, #f2c94c 35%, transparent);
  color: inherit;
  border-radius: 2px;
}
.aws-lines :deep(mark.cur) {
  background: #f2c94c;
  color: #131417;
}
</style>
