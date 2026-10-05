import { defineStore } from 'pinia'
import type { Project, Repo } from '#shared/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  /** Selected project id. */
  const sel = ref<string | null>(null)

  const current = computed(() => projects.value.find(p => p.id === sel.value) || null)
  const starred = computed(() => projects.value.filter(p => p.starred))
  const unstarred = computed(() => projects.value.filter(p => !p.starred))
  /** Projects as the sidebar lists them: starred first. Alt 1-9 and the palette follow this order. */
  const ordered = computed(() => [...starred.value, ...unstarred.value])

  function byId(id: string | null | undefined) {
    return projects.value.find(p => p.id === id) || null
  }

  function repoOf(pid: string, repoId: string): Repo {
    const p = byId(pid)
    return p?.repos.find(r => r.id === repoId) || { id: repoId, label: '?', path: '', cmd: 'claude', stack: '', branch: 'main', services: [] }
  }

  function update(id: string, fn: (p: Project) => Project) {
    projects.value = projects.value.map(p => (p.id === id ? fn(p) : p))
  }

  function patch(id: string, patch: Partial<Project>) {
    update(id, p => ({ ...p, ...patch }))
  }

  function add(p: Project) {
    projects.value = [...projects.value, p]
  }

  function remove(id: string) {
    projects.value = projects.value.filter(p => p.id !== id)
    if (sel.value === id) sel.value = projects.value[0]?.id ?? null
  }

  function toggleStar(id: string) {
    const p = byId(id)
    if (p) patch(id, { starred: !p.starred })
  }

  /** Drops a project next to another, taking on that project's section (starred or not). */
  function move(id: string, targetId: string, after: boolean) {
    const p = byId(id), t = byId(targetId)
    if (!p || !t || id === targetId) return
    const rest = projects.value.filter(x => x.id !== id)
    const at = rest.findIndex(x => x.id === targetId) + (after ? 1 : 0)
    rest.splice(at, 0, { ...p, starred: !!t.starred })
    projects.value = rest
  }

  return { projects, sel, current, starred, unstarred, ordered, byId, repoOf, update, patch, add, remove, toggleStar, move }
})
