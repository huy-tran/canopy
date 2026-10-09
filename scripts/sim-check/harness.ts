// A page that runs the workspace simulation on its own with made-up rooms and people, for
// scripts/sim-check.mjs to screenshot. The query string picks the view, time of day and weather.
import * as THREE from 'three'
import { WorkspaceScene } from '../../app/simulation/scene'
import { HQ_WINGS } from '../../app/simulation/github'

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

// GitHub HQ: repos with and without alerts, PRs in every review state (three waiting on you, one for days), and runs in every state.
const now = Date.now(), H = 3_600_000
const repoNames = ['acme/payments-api', 'acme/web', 'acme/mobile', 'me/dotfiles', 'acme/infra', 'acme/docs', 'acme/design-system', 'me/canopy', 'acme/search', 'acme/billing']
scene.syncGithub({
  repos: repoNames.map((name, i) => ({
    name, url: '', private: i % 3 !== 2, pushedAt: now - i * H, canopy: name.startsWith('me/'), openPulls: 3,
    alerts: i === 0 ? { critical: 1, high: 11, moderate: 13, low: 5, total: 30 } : i === 2 ? { critical: 0, high: 0, moderate: 4, low: 1, total: 5 } : { critical: 0, high: 0, moderate: 0, low: 0, total: 0 },
  })),
  pulls: [
    ...['mine', 'mine', 'mine'].map((review, i) => ({ url: 'u' + i, repo: repoNames[i]!, number: 40 + i, title: 'Fix it', author: ['sam', 'alex', 'sam'][i]!, createdAt: now - [5, 30, 90][i]! * H, review, checks: null })),
    ...Array.from({ length: 22 }, (_, i) => ({ url: 'o' + i, repo: repoNames[i % 10]!, number: 100 + i, title: 'Change', author: 'kim', createdAt: now - i * H, review: (['approved', 'changes', 'waiting', 'draft'] as const)[i % 4], checks: (['pass', 'fail', 'pending', null] as const)[i % 4] })),
  ],
  // Several workflows per repo, as the factory groups them, and a scheduled run it leaves out.
  runs: [
    ...(['running', 'success', 'failure', 'success', 'queued', 'success', 'cancelled', 'success', 'success', 'failure'] as const).map((state, i) => ({
      id: i, url: '', repo: repoNames[i % 5]!, workflow: ['CI', 'Deploy', 'Lint', 'Release'][Math.floor(i / 5) + (i % 2)]!, title: 't', branch: 'main', event: 'push', state, startedAt: now - i * H,
    })),
    { id: 99, url: '', repo: repoNames[0]!, workflow: 'Nightly sweep', title: 't', branch: 'main', event: 'schedule', state: 'success' as const, startedAt: now },
  ],
})

scene.setSky({ hour: Number(q.get('hour') ?? 14), sunrise: 6, sunset: 18, sky: q.get('sky') || null })

// Canopy's own numbers for the Canopy Core: two minutes of a calm app, or one whose main thread is lagging.
const hot = view === 'metrics-hot'
const history = Array.from({ length: 60 }, (_, i) => ({
  memMB: 1180 + i * 4 + Math.sin(i * 0.7) * 30,
  cpu: 6 + Math.abs(Math.sin(i * 0.4)) * (hot ? 40 : 8),
  fps: i % 17 === 5 ? 22 : 30,
  lagMs: hot && i > 45 ? 40 + (i % 5) * 12 : 2 + (i % 9 === 0 ? 9 : 1),
}))
const last = history.at(-1)!
scene.setMetrics({ ...last, lagMaxMs: hot ? 260 : 14, ptys: 6, history })

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
  else if (view.startsWith('metrics')) {
    const c = scene.core.group.position as THREE.Vector3
    at([c.x + 3.5, 4.2, c.z + 7.5], [c.x, 1.6, c.z])
  }
  else if (view.startsWith('hq')) {
    // The whole building, or one room from just outside its door.
    const hq = scene.hq.group.position as THREE.Vector3
    const dx = { 'hq-pulls': HQ_WINGS.pulls, 'hq-runs': HQ_WINGS.runs }[view] ?? null
    if (dx === null) at([hq.x, 24, hq.z + 30], [hq.x, 0, hq.z + 1])
    else at([hq.x + dx, 9, hq.z + 12], [hq.x + dx, 0.5, hq.z - 0.5])
  }
  ;(window as any).simErrors = errors
}, 400)

// What a frame costs, for sim-check.mjs to print: the last frame's draw calls and triangles, and the shader programs and lights.
setTimeout(() => {
  const r = scene.renderer as THREE.WebGLRenderer
  // three.js leaves the shadow pass out of its counts: the meshes casting a shadow stand in for its draw calls.
  let lights = 0, casters = 0
  scene.scene.traverseVisible((o: THREE.Object3D) => {
    if ((o as THREE.PointLight).isPointLight) lights++
    if ((o as THREE.Mesh).isMesh && o.castShadow) casters++
  })
  r.render(scene.scene, scene.camera)
  console.log('sim-info ' + JSON.stringify({ calls: r.info.render.calls, triangles: r.info.render.triangles, casters, programs: r.info.programs?.length, pointLights: lights }))
}, 3000)
