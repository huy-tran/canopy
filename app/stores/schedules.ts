import { defineStore } from 'pinia'
import type { Schedule } from '#shared/types'
import { dueAt } from '#shared/schedule'

/** Prompts that start a Claude session by themselves at a set time. They run while Canopy is open (the tray counts). */
export const useSchedulesStore = defineStore('schedules', () => {
  const list = ref<Schedule[]>([])

  /** Adds a schedule or replaces the one with its id. Saving counts as "ran", so an edit never fires a time already past today. */
  function save(s: Schedule) {
    const next = { ...s, lastRun: Date.now() }
    list.value = list.value.some(x => x.id === s.id) ? list.value.map(x => (x.id === s.id ? next : x)) : [...list.value, next]
  }

  function remove(id: string) {
    list.value = list.value.filter(x => x.id !== id)
  }

  function toggle(id: string, enabled: boolean) {
    list.value = list.value.map(x => (x.id === id ? { ...x, enabled, lastRun: Date.now() } : x))
  }

  /** Starts the session now and gives it the prompt. */
  async function run(id: string) {
    const s = list.value.find(x => x.id === id)
    if (!s) return
    const ui = useUiStore(), P = useProjectsStore()
    // Marked first, so a start that takes a while (or fails) is not tried again every second.
    list.value = list.value.map(x => (x.id === id ? { ...x, lastRun: Date.now() } : x))
    const p = P.byId(s.pid), r = p?.repos.find(x => x.id === s.repoId)
    if (!p || !r) {
      list.value = list.value.map(x => (x.id === id ? { ...x, enabled: false } : x))
      ui.toast({ title: `Scheduled prompt "${s.name}" turned off`, body: 'Its project or repo no longer exists.', error: true })
      return
    }
    const started = await useSessionsStore().start(p, r, { wt: s.wt, prompt: s.prompt, title: s.name })
    if (!started) return
    P.patch(p.id, { expanded: true })
    ui.toast({ title: `Scheduled prompt started: ${s.name}`, body: `${p.name} · ${r.label}`, hue: p.hue })
  }

  /** Called every second by the main window: runs whatever has come due. */
  function tick(now = Date.now()) {
    for (const s of list.value) if (dueAt(s, now) != null) run(s.id)
  }

  return { list, save, remove, toggle, run, tick }
})
