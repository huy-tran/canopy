<script setup lang="ts">
import { Compartment, EditorState } from '@codemirror/state'
import type { Text } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, LanguageDescription, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'
import { errMessage } from '#shared/errors'

type Btn = { label: string; value: string; primary?: boolean }
const props = defineProps<{
  cwd: string
  path: string
  wrap: boolean
  /** Changes whenever git status was read again, which is when the file may have changed on disk. */
  stamp?: number
  ask: (text: string, buttons: Btn[]) => Promise<string>
}>()
const emit = defineEmits<{ saved: []; close: [] }>()
const dirty = defineModel<boolean>('dirty', { default: false })

const ui = useUiStore()
const host = ref<HTMLElement | null>(null)
const error = ref('')
const loading = ref(true)
const saving = ref(false)
/** The file was changed on disk by someone else while it is open here. */
const stale = ref(false)
const mixed = ref(false)
const eolName = ref('LF')
let view: EditorView | null = null
let saved: Text | null = null
let mtime = 0
let eol = '\n'
let ignored = 0
const wrapC = new Compartment()
const langC = new Compartment()
const indentC = new Compartment()

/** Colours come from the same --syn-* variables the previews use, so both themes follow the app. */
const hl = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.bool, t.null, t.self], color: 'var(--syn-kw)' },
  { tag: [t.string, t.regexp, t.special(t.string), t.character], color: 'var(--syn-str)' },
  { tag: [t.number, t.unit, t.color], color: 'var(--syn-num)' },
  { tag: [t.comment, t.docComment], color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--syn-fn)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.variableName)], color: 'var(--syn-ty)' },
  { tag: [t.tagName, t.angleBracket, t.heading], color: 'var(--syn-tag)' },
  { tag: [t.attributeName], color: 'var(--syn-at)' },
  { tag: [t.propertyName, t.labelName], color: 'var(--syn-pr)' },
  { tag: t.link, textDecoration: 'underline' },
])

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--term)', color: 'var(--ttx)', fontSize: '12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--tx)', padding: '8px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--tx)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--fa)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 6px', minWidth: '34px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--sel) 45%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--tx3)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in oklch, var(--lnk) 30%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in oklch, var(--amb) 25%, transparent)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in oklch, var(--lnk) 25%, transparent)', outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--modal)', color: 'var(--tx)', borderColor: 'var(--ln)' },
  '.cm-panels input, .cm-panels button': { fontSize: '11.5px' },
  '.cm-textfield': { backgroundColor: 'var(--term)', border: '1px solid var(--bb)', color: 'var(--tx)' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--hov)', border: '1px solid var(--bb)', color: 'var(--tx)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in oklch, var(--amb) 25%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in oklch, var(--amb) 45%, transparent)' },
})

/** The file's own indent: tabs when most indented lines use them, else the smallest space step (2 or 4). */
function indentOf(text: string) {
  const tab = String.fromCharCode(9)
  let tabs = 0, spaces = 0, step = 0
  for (const line of text.split('\n', 400)) {
    if (line.startsWith(tab)) tabs++
    else {
      const n = (/^ +/.exec(line)?.[0] || '').length
      if (n) {
        spaces++
        step = step ? Math.min(step, n) : n
      }
    }
  }
  if (tabs > spaces) return { unit: tab, size: 4 }
  const size = step === 2 || !step ? 2 : 4
  return { unit: ' '.repeat(size), size }
}

async function load() {
  loading.value = true
  error.value = ''
  stale.value = false
  dirty.value = false
  const r = await api.git.readEdit(props.cwd, props.path)
  if (!r.ok || r.text == null) {
    error.value = r.error || 'Could not open this file.'
    loading.value = false
    return
  }
  mtime = r.mtime || 0
  ignored = 0
  eol = r.eol || '\n'
  eolName.value = eol === '\n' ? 'LF' : 'CRLF'
  mixed.value = !!r.mixed
  const ind = indentOf(r.text)
  const state = EditorState.create({
    doc: r.text,
    extensions: [
      lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(),
      highlightSelectionMatches(), syntaxHighlighting(hl), theme,
      indentC.of([indentUnit.of(ind.unit), EditorState.tabSize.of(ind.size)]),
      wrapC.of(props.wrap ? EditorView.lineWrapping : []), langC.of([]),
      keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => (save(), true) }, ...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && saved) dirty.value = !u.state.doc.eq(saved)
      }),
    ],
  })
  saved = state.doc
  loading.value = false
  await nextTick()
  if (!host.value) return
  view?.destroy()
  view = new EditorView({ state, parent: host.value })
  view.focus()
  // The language arrives after the text is on screen.
  const d = LanguageDescription.matchFilename(languages, props.path.split('/').pop() || '')
  d?.load().then(l => view?.dispatch({ effects: langC.reconfigure(l) })).catch(() => {})
}

async function save(): Promise<boolean> {
  if (!view || saving.value) return false
  if (!dirty.value) return true
  saving.value = true
  try {
    const text = view.state.doc.toString()
    let r = await api.git.writeEdit(props.cwd, props.path, text, mtime, eol)
    if (!r.ok && r.changed) {
      const a = await props.ask(`${props.path} changed on disk since you opened it (Claude may have edited it). Overwrite it with your version?`, [
        { label: 'Overwrite', value: 'yes', primary: true },
        { label: 'Cancel', value: 'cancel' },
      ])
      if (a !== 'yes') return false
      const fresh = await api.git.readEdit(props.cwd, props.path)
      if (!fresh.ok) throw new Error(fresh.error)
      r = await api.git.writeEdit(props.cwd, props.path, text, fresh.mtime || 0, eol)
    }
    if (!r.ok) throw new Error(r.error || 'Could not save.')
    mtime = r.mtime || mtime
    saved = view.state.doc
    dirty.value = false
    stale.value = false
    mixed.value = false
    emit('saved')
    return true
  } catch (e) {
    ui.toast({ title: 'Could not save', body: errMessage(e), error: true })
    return false
  } finally {
    saving.value = false
  }
}

/** Looks at the file on disk: Claude (or anything else) may have written it since it was opened here. */
async function checkDisk() {
  if (loading.value || saving.value || error.value) return
  const r = await api.git.readEdit(props.cwd, props.path)
  if (!r.ok || r.mtime == null || saving.value) return
  if (Math.abs(r.mtime - mtime) > 1 && Math.abs(r.mtime - ignored) > 1) stale.value = true
}

async function reload() {
  if (dirty.value) {
    const a = await props.ask('Reload and lose your unsaved edits?', [{ label: 'Reload', value: 'yes', primary: true }, { label: 'Cancel', value: 'cancel' }])
    if (a !== 'yes') return
  }
  await load()
}

async function keepMine() {
  const r = await api.git.readEdit(props.cwd, props.path)
  ignored = r.mtime || 0
  stale.value = false
  view?.focus()
}

watch(() => props.wrap, w => view?.dispatch({ effects: wrapC.reconfigure(w ? EditorView.lineWrapping : []) }))
watch(() => [props.cwd, props.path], load)
watch(() => props.stamp, checkDisk)
onMounted(load)
onBeforeUnmount(() => view?.destroy())
defineExpose({ save })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center gap-2.5 border-b border-(--ln2) py-1.5 pr-3 pl-[14px] text-[11.5px]">
      <span :class="dirty ? 'text-(--amb)' : 'text-(--mu)'">{{ dirty ? 'Unsaved changes' : 'Editing' }}</span>
      <span class="text-(--fa)">Ctrl S saves · Ctrl F find · Alt G go to line · {{ eolName }}</span>
      <div class="flex-1" />
      <UButton color="neutral" variant="outline" size="xs" class="h-[22px] px-2 text-[11px]" @mousedown.prevent @click="emit('close')">
        Done
      </UButton>
      <UButton color="primary" variant="solid" size="xs" class="h-[22px] px-2 text-[11px]" :disabled="!dirty || saving" :loading="saving" @mousedown.prevent @click="save">
        Save
      </UButton>
    </div>
    <div v-if="stale" class="flex items-center gap-2.5 border-b border-(--ln2) px-[14px] py-1.5 text-[11.5px] text-(--amb)">
      <span class="flex-1">This file changed on disk (Claude may have edited it).</span>
      <UButton color="neutral" variant="outline" size="xs" class="h-[22px] px-2 text-[11px]" @mousedown.prevent @click="reload">
        {{ dirty ? 'Reload (loses your edits)' : 'Reload' }}
      </UButton>
      <UButton color="neutral" variant="ghost" size="xs" class="h-[22px] px-2 text-[11px]" @mousedown.prevent @click="keepMine">
        Keep mine
      </UButton>
    </div>
    <div v-if="mixed" class="border-b border-(--ln2) px-[14px] py-1.5 text-[11.5px] text-(--mu)">
      This file mixes line endings. Saving makes every line {{ eolName }}.
    </div>
    <div v-if="error" class="px-[14px] py-3 text-[12px] text-(--red)">
      {{ error }}
    </div>
    <div v-show="!error" ref="host" class="mono min-h-0 flex-1 overflow-hidden" />
  </div>
</template>
