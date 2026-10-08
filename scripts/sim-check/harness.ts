// A page that runs the workspace simulation on its own with made-up rooms and people, for
// scripts/sim-check.mjs to screenshot. The query string picks the view, time of day and weather.
import * as THREE from 'three'
import { WorkspaceScene } from '../../app/simulation/scene'

const q = new URLSearchParams(location.search)
const view = q.get('view') || 'all'
const errors: string[] = []
window.addEventListener('error', e => errors.push(String(e.message)))

const scene: any = new WorkspaceScene({
  container: document.getElementById('c')!,
  onHover: () => {},
  onSelect: () => {},
  onMenu: () => {},
  onFarewell: () => {},
})
// A day count, to lay the common room out for that day's lineup.
if (q.has('day')) scene.today = () => Number(q.get('day'))

const rooms = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, i) => ({
  id: 'r' + i, name, hue: i * 85 + 20, stats: { sessions: 3, working: 2, waiting: 1, subagents: 1, today: '$1.20' },
}))
// Bravo's desks show every way of working; the rest are out in the common room or by the stage.
const acts = ['read', 'run', 'test', 'web', 'delegate', 'plan', 'write'] as const
const people: any[] = [
  ...acts.map((act, i) => ({ id: 'w' + i, roomId: 'r1', status: 'working', act })),
  { id: 'q0', roomId: 'r0', status: 'waiting', act: '' },
  ...Array.from({ length: 10 }, (_, i) => ({ id: 'i' + i, roomId: 'r' + (i % 4), status: i % 3 ? 'idle' : 'done', act: '' })),
].map((p, i) => ({ parentId: null, name: 'P' + i, role: i % 2 ? 'designer' : 'developer', title: 't', line: null, result: null, ...p }))
people.push({ id: 's0', roomId: 'r1', parentId: 'w4', name: 'Sub', role: 'developer', status: 'working', title: 't', line: null, act: '', result: null })
scene.sync(rooms, people)

scene.setSky({ hour: Number(q.get('hour') ?? 14), sunrise: 6, sunset: 18, sky: q.get('sky') || null })

// Run the clock fast so people settle into their spots and the band gets going.
const fast = Number(q.get('fast') || 0)
if (fast) {
  const clock = scene.clock as THREE.Clock
  const tick = clock.getDelta.bind(clock)
  clock.getDelta = () => { tick(); clock.elapsedTime += 0.05 * fast; return 0.05 }
}

// A command failing and a test run passing. Headless frames are too sparse to catch a short
// reaction in time, so these are held for as long as the page runs.
if (view === 'react') {
  const now = Date.now()
  scene.sync(rooms, people.map(p => p.id === 'w1' ? { ...p, result: { ok: false, test: false, at: now } } : p.id === 'w2' ? { ...p, result: { ok: true, test: true, at: now } } : p))
  for (const id of ['w1', 'w2']) {
    const a = scene.people.get(id)
    a.react.until = 1e9
    a.bubbleUntil = 1e9
  }
}

setTimeout(() => {
  scene.fly = null
  const at = (pos: number[], target: number[]) => {
    scene.camera.position.set(...pos)
    scene.controls.target.set(...target)
  }
  const bravo = scene.rooms.get('r1').center as THREE.Vector3
  if (view === 'stage') at([5, 8, 33], [0, 0.8, 21])
  else if (view === 'common') {
    // The middle tables and the front corner's game, from the sofas' side of the room.
    const x1 = (scene.bounds.w - 8) / 2
    at([x1 - 1, 8, 24], [x1 - 6, 0.5, 12])
  }
  else if (view === 'desks') at([bravo.x + 4, 6, bravo.z + 8], [bravo.x, 0.6, bravo.z])
  else if (view === 'react') at([bravo.x + 2, 4, bravo.z + 5], [bravo.x, 0.8, bravo.z])
  ;(window as any).simErrors = errors
}, 400)
