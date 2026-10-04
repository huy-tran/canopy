// Past Claude Code sessions (JSONL logs) for the selected project, refreshed while mounted.
import type { HistorySession } from '#shared/types'

export function useOverviewHistory(everyMs = 30_000) {
  const P = useProjectsStore()
  const history = ref<HistorySession[]>([])
  const loaded = ref(false)
  let seq = 0, timer: ReturnType<typeof setInterval> | null = null

  // Re-read when the project or its repo paths change.
  const key = computed(() => {
    const p = P.current
    return p ? p.id + '|' + p.repos.map(r => r.id + '=' + r.path).join(';') : ''
  })

  async function refresh() {
    const p = P.current, my = ++seq
    if (!p || !p.repos.length) {
      history.value = []
      loaded.value = true
      return
    }
    try {
      const res = await api.history(p.repos.map(r => ({ id: r.id, path: r.path })))
      if (my === seq) history.value = res
    } catch {
      // Keep the last good read; logs may be mid-write.
    } finally {
      if (my === seq) loaded.value = true
    }
  }

  watch(key, (k, old) => {
    if (old !== undefined && k.split('|')[0] !== old.split('|')[0]) {
      history.value = []
      loaded.value = false
    }
    refresh()
  }, { immediate: true })

  onMounted(() => { timer = setInterval(refresh, everyMs) })
  onBeforeUnmount(() => { if (timer) clearInterval(timer) })

  return { history, loaded, refresh }
}
