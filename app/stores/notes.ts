import { defineStore } from 'pinia'
import type { ReviewNote } from '#shared/reviewnotes'

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()

/** Review comments on lines in the file explorer, per working folder, kept (across restarts too) until they are sent to Claude or cleared. */
export const useNotesStore = defineStore('notes', () => {
  const byCwd = ref<Record<string, ReviewNote[]>>({})

  const of = (cwd: string) => byCwd.value[norm(cwd)] || []

  function put(cwd: string, list: ReviewNote[]) {
    const next = { ...byCwd.value }
    if (list.length) next[norm(cwd)] = list
    else delete next[norm(cwd)]
    byCwd.value = next
  }

  /** Adds a comment on a line, or replaces the one already there. */
  function save(cwd: string, n: Omit<ReviewNote, 'id'>) {
    const rest = of(cwd).filter(x => !(x.path === n.path && x.line === n.line && x.sign === n.sign))
    put(cwd, n.text.trim() ? [...rest, { ...n, text: n.text.trim(), id: uid('n') }] : rest)
  }

  function remove(cwd: string, id: string) {
    put(cwd, of(cwd).filter(x => x.id !== id))
  }

  function clear(cwd: string) {
    put(cwd, [])
  }

  return { byCwd, of, save, remove, clear }
})
