<script setup lang="ts">
// Draw on a frozen picture of the page: numbered boxes, arrows, freehand, notes, and blur for what should not leave the screen.
// Send puts the marked-up picture at Claude's prompt; with a note typed, it sends the prompt too.
type Tool = 'box' | 'arrow' | 'pen' | 'text' | 'blur'
type Pt = [number, number]
type Item =
  | { kind: 'pen'; pts: Pt[]; c: string }
  | { kind: 'box'; x: number; y: number; w: number; h: number; c: string }
  | { kind: 'blur'; x: number; y: number; w: number; h: number; c: string }
  | { kind: 'arrow'; x: number; y: number; x2: number; y2: number; c: string }
  | { kind: 'text'; x: number; y: number; t: string; c: string }

const props = defineProps<{ src: string }>()
const emit = defineEmits<{ send: [blob: Blob, note: string]; cancel: [] }>()
const ui = useUiStore()

const canvas = ref<HTMLCanvasElement>()
const wrap = ref<HTMLElement>()
const tool = ref<Tool>('box')
const color = ref('#ff3b30')
const items = ref<Item[]>([])
const draft = ref<Item | null>(null)
const text = ref<{ x: number; y: number; left: number; top: number; text: string } | null>(null)
const textInput = ref<HTMLInputElement>()
const note = ref('')
const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff']
const TOOLS: { id: Tool; icon: string; label: string }[] = [
  { id: 'box', icon: 'i-hugeicons-square', label: 'Box a component (numbered)' },
  { id: 'arrow', icon: 'i-hugeicons-arrow-move-up-right', label: 'Arrow' },
  { id: 'pen', icon: 'i-hugeicons-pencil-edit-01', label: 'Draw freehand' },
  { id: 'text', icon: 'i-hugeicons-text', label: 'Add a label' },
  { id: 'blur', icon: 'i-hugeicons-blur', label: 'Blur something private' },
]

const img = new Image()
let loaded = false

/** Drawing units are the picture's own pixels; this is how many of them one screen pixel covers, so lines look the same at any size. */
function k() {
  const c = canvas.value
  return c && c.clientWidth ? Math.max(1, c.width / c.clientWidth) : 1
}

/** Pixelates a rectangle of the picture, so what is under it cannot be read. */
function pixelate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const rx = Math.min(x, x + w), ry = Math.min(y, y + h), rw = Math.abs(w), rh = Math.abs(h)
  if (rw < 2 || rh < 2) return
  const cell = Math.max(6, Math.round(Math.min(rw, rh) / 6))
  const tiny = document.createElement('canvas')
  tiny.width = Math.max(1, Math.round(rw / cell))
  tiny.height = Math.max(1, Math.round(rh / cell))
  tiny.getContext('2d')!.drawImage(img, rx, ry, rw, rh, 0, 0, tiny.width, tiny.height)
  g.save()
  g.imageSmoothingEnabled = false
  g.drawImage(tiny, 0, 0, tiny.width, tiny.height, rx, ry, rw, rh)
  g.restore()
}

function draw() {
  const c = canvas.value
  const g = c?.getContext('2d')
  if (!c || !g || !loaded) return
  g.clearRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0)
  const s = k()
  const all = [...items.value, ...(draft.value ? [draft.value] : [])]
  // Blurs first, so a box or note drawn over one stays readable.
  for (const it of all) if (it.kind === 'blur') pixelate(g, it.x, it.y, it.w, it.h)
  let n = 0
  for (const it of all) {
    g.strokeStyle = g.fillStyle = it.c
    g.lineWidth = 3 * s
    g.lineCap = g.lineJoin = 'round'
    if (it.kind === 'blur') {
      g.save()
      g.setLineDash([6 * s, 4 * s])
      g.lineWidth = 1.5 * s
      g.strokeRect(it.x, it.y, it.w, it.h)
      g.restore()
    } else if (it.kind === 'pen') {
      g.beginPath()
      it.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
    } else if (it.kind === 'arrow') {
      const a = Math.atan2(it.y2 - it.y, it.x2 - it.x)
      const head = 14 * s
      g.beginPath()
      g.moveTo(it.x, it.y)
      g.lineTo(it.x2, it.y2)
      g.stroke()
      g.beginPath()
      g.moveTo(it.x2, it.y2)
      g.lineTo(it.x2 - head * Math.cos(a - Math.PI / 6), it.y2 - head * Math.sin(a - Math.PI / 6))
      g.lineTo(it.x2 - head * Math.cos(a + Math.PI / 6), it.y2 - head * Math.sin(a + Math.PI / 6))
      g.closePath()
      g.fill()
    } else if (it.kind === 'box') {
      g.strokeRect(it.x, it.y, it.w, it.h)
      n++
      const r = 10 * s
      const bx = Math.min(it.x, it.x + it.w), by = Math.min(it.y, it.y + it.h)
      g.beginPath()
      g.arc(bx, by, r, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
      g.font = `700 ${12 * s}px sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(n), bx, by + s * 0.5)
    } else {
      g.font = `600 ${15 * s}px sans-serif`
      g.textAlign = 'left'
      g.textBaseline = 'top'
      const w = g.measureText(it.t).width
      g.fillStyle = 'rgba(0,0,0,.72)'
      g.fillRect(it.x - 4 * s, it.y - 3 * s, w + 8 * s, 21 * s)
      g.fillStyle = it.c
      g.fillText(it.t, it.x, it.y)
    }
  }
}

onMounted(() => {
  img.onload = () => {
    const c = canvas.value
    if (!c) return
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    loaded = true
    draw()
  }
  img.src = props.src
  window.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
watch([items, draft], draw, { deep: true })

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    if (text.value) text.value = null
    else emit('cancel')
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !text.value && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault()
    undo()
  }
}

function pos(e: PointerEvent): Pt {
  const r = canvas.value!.getBoundingClientRect()
  return [(e.clientX - r.left) * (canvas.value!.width / r.width), (e.clientY - r.top) * (canvas.value!.height / r.height)]
}

function down(e: PointerEvent) {
  if (text.value) commitText()
  const [x, y] = pos(e)
  if (tool.value === 'text') {
    const r = wrap.value!.getBoundingClientRect()
    text.value = { x, y, left: e.clientX - r.left, top: e.clientY - r.top, text: '' }
    nextTick(() => textInput.value?.focus())
    return
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  const c = color.value
  draft.value = tool.value === 'pen' ? { kind: 'pen', pts: [[x, y]], c }
    : tool.value === 'arrow' ? { kind: 'arrow', x, y, x2: x, y2: y, c }
      : { kind: tool.value as 'box' | 'blur', x, y, w: 0, h: 0, c }
}

function move(e: PointerEvent) {
  const d = draft.value
  if (!d) return
  const [x, y] = pos(e)
  if (d.kind === 'pen') draft.value = { ...d, pts: [...d.pts, [x, y]] }
  else if (d.kind === 'arrow') draft.value = { ...d, x2: x, y2: y }
  else if (d.kind === 'box' || d.kind === 'blur') draft.value = { ...d, w: x - d.x, h: y - d.y }
}

function up() {
  const d = draft.value
  draft.value = null
  if (!d) return
  // A click without a drag is not a shape.
  const tiny = d.kind === 'box' || d.kind === 'blur' ? Math.abs(d.w) < 6 && Math.abs(d.h) < 6
    : d.kind === 'arrow' ? Math.hypot(d.x2 - d.x, d.y2 - d.y) < 8
      : d.kind === 'pen' ? d.pts.length < 3 : false
  if (!tiny) items.value = [...items.value, d]
}

function commitText() {
  const n = text.value
  text.value = null
  if (n?.text.trim()) items.value = [...items.value, { kind: 'text', x: n.x, y: n.y, t: n.text.trim(), c: color.value }]
}

function undo() {
  items.value = items.value.slice(0, -1)
}

/** The marked-up picture, drawn without any half-made shape. */
function render(): Promise<Blob | null> {
  if (text.value) commitText()
  draft.value = null
  return new Promise(resolve => nextTick(() => canvas.value?.toBlob(resolve, 'image/png')))
}

async function send() {
  const b = await render()
  if (b) emit('send', b, note.value)
}

async function copy() {
  const b = await render()
  if (!b) return
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
    ui.toast({ title: 'Copied the marked-up picture' })
  } catch {
    ui.toast({ title: 'Could not copy the picture', error: true })
  }
}

const btn = 'grid size-7 cursor-pointer place-items-center rounded-md text-[14px] hover:bg-(--hov) disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent'
</script>

<template>
  <div ref="wrap" class="absolute inset-0 z-20 bg-black/60">
    <canvas ref="canvas" class="block size-full cursor-crosshair touch-none" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" />
    <input
      v-if="text"
      ref="textInput"
      v-model="text.text"
      placeholder="Label, then Enter"
      class="mono absolute z-10 h-6 w-[220px] rounded border border-(--bb) bg-(--chrome) px-2 text-[11.5px] text-(--tx) outline-none"
      :style="{ left: text.left + 'px', top: text.top + 'px' }"
      @keydown.enter.prevent="commitText"
      @pointerdown.stop
    >
    <div class="absolute inset-x-3 bottom-3.5 z-10 mx-auto flex max-w-[560px] flex-col gap-1.5 rounded-xl border border-(--bb) bg-(--chrome) p-1.5 shadow-xl" @pointerdown.stop>
      <input
        v-model="note"
        placeholder="Tell Claude what to change (Enter sends it as a prompt)"
        class="h-8 rounded-md border border-(--ln) bg-(--term) px-2.5 text-[12px] text-(--tx) outline-none focus:border-(--bb)"
        @keydown.enter.prevent="send"
      >
      <div class="flex flex-wrap items-center gap-1">
        <UTooltip v-for="t in TOOLS" :key="t.id" :text="t.label">
          <button :class="[btn, tool === t.id ? 'bg-(--hov) text-(--tx)' : 'text-(--mu)']" @click="tool = t.id"><UIcon :name="t.icon" /></button>
        </UTooltip>
        <span class="mx-1 h-4 w-px bg-(--ln)" />
        <button v-for="c in COLORS" :key="c" class="grid size-6 cursor-pointer place-items-center rounded-full" @click="color = c">
          <span class="size-3.5 rounded-full" :style="{ background: c, outline: color === c ? '2px solid var(--tx)' : 'none', outlineOffset: '2px' }" />
        </button>
        <span class="mx-1 h-4 w-px bg-(--ln)" />
        <UTooltip text="Undo (Ctrl+Z)"><button :class="[btn, 'text-(--mu)']" :disabled="!items.length" @click="undo"><UIcon name="i-hugeicons-undo-02" /></button></UTooltip>
        <UTooltip text="Clear all"><button :class="[btn, 'text-(--mu)']" :disabled="!items.length" @click="items = []"><UIcon name="i-hugeicons-delete-02" /></button></UTooltip>
        <UTooltip text="Copy the picture"><button :class="[btn, 'text-(--mu)']" @click="copy"><UIcon name="i-hugeicons-copy-01" /></button></UTooltip>
        <div class="flex-1" />
        <UButton color="neutral" variant="ghost" size="xs" label="Cancel" @click="emit('cancel')" />
        <UButton color="primary" size="xs" icon="i-hugeicons-sent" :label="note.trim() ? 'Send prompt' : 'Add to prompt'" @click="send" />
      </div>
    </div>
  </div>
</template>
