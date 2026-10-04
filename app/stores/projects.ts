import { defineStore } from 'pinia'
import type { Project, Repo } from '#shared/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  /** Selected project id. */
  const sel = ref<string | null>(null)

  const current = computed(() => projects.value.find(p => p.id === sel.value) || null)

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

  return { projects, sel, current, byId, repoOf, update, patch, add, remove }
})
