import { defineStore } from 'pinia'
import type { GitStatus } from '#shared/types'

/** Git status per working folder (repo or worktree), refreshed while something shows it. */
export const useGitStore = defineStore('git', () => {
  const byCwd = ref<Record<string, GitStatus & { at: number }>>({})
  const inflight = new Map<string, Promise<void>>()

  function refresh(cwd: string): Promise<void> {
    if (!cwd) return Promise.resolve()
    const cur = inflight.get(cwd)
    if (cur) return cur
    const p = api.git.status(cwd).then((s) => {
      byCwd.value = { ...byCwd.value, [cwd]: { ...s, at: Date.now() } }
    }).finally(() => inflight.delete(cwd))
    inflight.set(cwd, p)
    return p
  }

  function get(cwd: string) {
    return byCwd.value[cwd] || null
  }

  return { byCwd, refresh, get }
})
