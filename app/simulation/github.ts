import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { GhPull, GhRepo, GhRun } from '#shared/types'
import { bigScreen, boxGeo, carpet, coffeeBar, disposeTree, doorArch, FONT, floorText, figure, type Figure, freeze, geo, hashOf, lightPool, lowWall, mat, mesh, plant, rbox, roundGeo, sofa, tag } from './kit'

/**
 * GitHub HQ: a building of its own beside the office, with two rooms and a staff of octocats.
 *
 * The PR mailroom keeps a parcel in the pigeonholes for each open pull request, coloured by its
 * review. The ones waiting for the user's review sit on the counter, their authors queueing in front
 * of it and getting more impatient the longer they wait, while Mona the clerk carries parcels
 * between the pigeonholes and the counter and calls out who is waiting. While they wait, authors
 * wander off to the lounge at the front: the sofa with the magazines, the coffee bar or the water
 * cooler, the patient ones most often. When nothing is waiting for you, Mona has a cup of tea.
 *
 * The workflow factory has a production line per repo: a conveyor, a machine with a lamp for each of
 * the repo's workflows, and a chimney that smokes and a beacon that turns while any of them runs.
 * Scheduled runs only show while they run or after they fail.
 * A board on the back wall lists what is running and for how long, and foreman cats in hard hats go
 * from machine to machine saying what each one is doing.
 *
 * Picks are `{ kind: 'gh', id }` with ids `pr:<url>`, `repo:owner/name` (a factory line),
 * `run:owner/name|workflow` (one of its lamps), `wing:pulls|runs` and `hq`.
 */

export interface HqData {
  repos: GhRepo[]
  pulls: GhPull[]
  runs: GhRun[]
  /** Still reading GitHub for the first time. */
  loading?: boolean
  error?: string
  /** GitHub's hourly allowance is running low and Canopy is reading less until then (a time), or 0. */
  slowUntil?: number
}

const WING_D = 11
/** The rooms from left to right, with their widths; the factory gets the most room. */
const ROOMS = [
  { id: 'pulls', name: 'Pull requests', color: '#8250df', w: 12 },
  { id: 'runs', name: 'Workflows', color: '#d4a72c', w: 15 },
] as const
const INNER = ROOMS.reduce((a, r) => a + r.w, 0)
/** Each room's centre along x, from the group's origin. */
export const HQ_WINGS: Record<(typeof ROOMS)[number]['id'], number> = Object.fromEntries(
  ROOMS.map((r, i) => [r.id, -INNER / 2 + ROOMS.slice(0, i).reduce((a, x) => a + x.w, 0) + r.w / 2]),
) as any
/** The whole site: the rooms and the plaza in front, centred on the group's origin along x. */
export const HQ_SIZE = { w: INNER + 2, d: WING_D + 6, cz: 2.5 }
/** Where the path from the office meets the plaza, along z from the group's origin. */
export const HQ_PATH_Z = WING_D / 2 + 2.6

const REVIEW_COLOR: Record<GhPull['review'], string> = { mine: '#f2c94c', approved: '#2da44e', changes: '#cf222e', waiting: '#54aeff', draft: '#8c959f' }
const RUN_COLOR: Record<GhRun['state'], string> = { queued: '#d4a72c', running: '#f5b544', success: '#2da44e', failure: '#ff4d4f', cancelled: '#8c959f', skipped: '#6e7781' }
const RUN_WORD: Record<GhRun['state'], string> = { queued: 'Queued', running: 'Running', success: 'Passed', failure: 'Failed', cancelled: 'Cancelled', skipped: 'Skipped' }

const MAX_CUBBIES = 30
const MAX_QUEUE = 6
const MAX_STATIONS = 12
const DAY = 86_400_000
/** Station spots in the factory: four lines across, three deep, each running towards the door. */
const COLS = [-5.25, -1.75, 1.75, 5.25]
const ROWS = [-2.5, 0.5, 3.4]

const live = (r: GhRun) => r.state === 'running' || r.state === 'queued'
/** What needs looking at first: a run going, then one that failed, then one waiting to start. */
const URGENCY: Record<GhRun['state'], number> = { running: 0, failure: 1, queued: 2, success: 3, cancelled: 4, skipped: 5 }
/** Scheduled runs (nightly jobs, sweeps) only earn a place on the factory floor while they run or after they fail. */
const onFloor = (r: GhRun) => r.event !== 'schedule' || live(r) || r.state === 'failure'
/** How many workflows' lamps fit across one machine. */
const MAX_LAMPS = 5
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!
/** Scratch for a cat's step, so walking allocates nothing. */
const toward = new THREE.Vector3()

/** A colour pushed towards GitHub's dark canvas, for floors and walls. */
function dark(color: string, amount: number) {
  return new THREE.Color(color).lerp(new THREE.Color('#161b22'), amount).getStyle()
}

function canvasPlane(c: HTMLCanvasElement, w: number, h: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, side: THREE.DoubleSide, ...opts })
  return mesh(new THREE.PlaneGeometry(w, h), material, false)
}

/** A sign with a line of text, or a big line over a small one. */
function plate(text: string, w: number, h: number, bg: string, fg = '#ffffff', sub = '') {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = Math.round((512 * h) / w)
  const x = c.getContext('2d')!
  x.fillStyle = bg
  x.beginPath()
  x.roundRect(0, 0, c.width, c.height, Math.min(28, c.height * 0.25))
  x.fill()
  x.fillStyle = fg
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  if (sub) {
    x.font = `700 ${Math.round(c.height * 0.42)}px ${FONT}`
    x.fillText(text, c.width / 2, c.height * 0.36, c.width * 0.92)
    x.globalAlpha = 0.7
    x.font = `500 ${Math.round(c.height * 0.26)}px ${FONT}`
    x.fillText(sub, c.width / 2, c.height * 0.76, c.width * 0.92)
  } else {
    x.font = `600 ${Math.round(c.height * 0.56)}px ${FONT}`
    x.fillText(text, c.width / 2, c.height * 0.54, c.width * 0.92)
  }
  return canvasPlane(c, w, h)
}

/** Yellow and black hazard stripes round the edge of a station's patch of floor. */
function hazard(w: number, d: number) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = Math.round((256 * d) / w)
  const x = c.getContext('2d')!
  const band = 14
  x.save()
  x.beginPath()
  x.rect(0, 0, c.width, c.height)
  x.rect(band, band, c.width - band * 2, c.height - band * 2)
  x.clip('evenodd')
  x.fillStyle = '#f2c94c'
  x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = '#1f2328'
  for (let i = -c.height; i < c.width + c.height; i += 22) {
    x.beginPath()
    x.moveTo(i, 0)
    x.lineTo(i + 11, 0)
    x.lineTo(i + 11 - c.height, c.height)
    x.lineTo(i - c.height, c.height)
    x.fill()
  }
  x.restore()
  const p = canvasPlane(c, w, d, { roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  p.rotation.x = -Math.PI / 2
  p.position.y = 0.05
  return p
}

const short = (repo: string) => repo.split('/').pop() || repo

/** How long someone has waited, as "3h" or "2d". */
function waited(ms: number) {
  const h = Math.max(0, Math.floor(ms / 3_600_000))
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`
}

/** How long a run has been going, as "42s", "3m 05s" or "1h 12m". */
function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60), h = Math.floor(m / 60)
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

// ---------------------------------------------------------------- the octocats

interface Octocat {
  group: THREE.Group
  rig: THREE.Group
  head: THREE.Object3D
  arms: [THREE.Object3D, THREE.Object3D]
  legs: THREE.Object3D[]
  /** A parcel held out in front, shown while carrying one. */
  load: THREE.Object3D
}

/**
 * GitHub's mascot as a chibi: a big cat head with a pale face on a small round body, and tentacles
 * for legs and arms. Clerks wear a postal cap, foremen a hard hat.
 */
function octocat(hat: 'post' | 'hard'): Octocat {
  const g = new THREE.Group()
  const rig = new THREE.Group()
  g.add(rig)
  const fur = mat('#24292f', { roughness: 0.7 })
  const face = mat('#f6d6c4', { roughness: 0.75 })
  const ink = mat('#1d1b20', { roughness: 0.5 })

  const body = mesh(geo('oc-body', () => new THREE.SphereGeometry(0.3, 20, 14)), fur)
  body.scale.set(1, 0.85, 0.9)
  body.position.y = 0.46
  rig.add(body)

  // Five tentacles curling out under the body.
  const legs: THREE.Object3D[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    const pivot = new THREE.Group()
    pivot.position.set(Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.17)
    pivot.rotation.y = a
    const leg = mesh(geo('oc-leg', () => new THREE.CapsuleGeometry(0.055, 0.2, 4, 8)), fur)
    leg.position.set(0, -0.12, 0.05)
    leg.rotation.x = 0.55
    pivot.add(leg)
    rig.add(pivot)
    legs.push(pivot)
  }
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.27, 0.6, 0.02)
    const arm = mesh(geo('oc-arm', () => new THREE.CapsuleGeometry(0.05, 0.22, 4, 8)), fur)
    arm.position.y = -0.14
    pivot.add(arm)
    pivot.rotation.z = side * 0.5
    rig.add(pivot)
    return pivot
  }) as unknown as [THREE.Object3D, THREE.Object3D]

  const head = new THREE.Group()
  head.position.y = 1.0
  rig.add(head)
  const skull = mesh(geo('oc-head', () => new THREE.SphereGeometry(0.42, 26, 20)), fur)
  skull.scale.set(1.15, 0.92, 1)
  head.add(skull)
  for (const side of [-1, 1]) {
    const ear = mesh(geo('oc-ear', () => new THREE.ConeGeometry(0.15, 0.3, 12)), fur)
    ear.position.set(side * 0.3, 0.36, 0)
    ear.rotation.z = side * -0.45
    head.add(ear)
    const eye = mesh(geo('oc-eye', () => new THREE.SphereGeometry(0.06, 12, 10)), ink, false)
    eye.scale.set(0.8, 1.15, 0.5)
    eye.position.set(side * 0.13, -0.02, 0.39)
    head.add(eye)
  }
  const mask = mesh(geo('oc-face', () => new THREE.SphereGeometry(0.34, 22, 16)), face)
  mask.scale.set(1.1, 0.72, 0.5)
  mask.position.set(0, -0.06, 0.22)
  head.add(mask)
  const nose = mesh(geo('oc-nose', () => new THREE.SphereGeometry(0.035, 10, 8)), mat('#e58a8a'), false)
  nose.position.set(0, -0.1, 0.4)
  head.add(nose)

  if (hat === 'hard') {
    const shell = mesh(geo('oc-hard', () => new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#f2c94c', { roughness: 0.4 }))
    shell.position.y = 0.3
    head.add(shell)
    const brim = mesh(geo('oc-brim', () => new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20)), mat('#f2c94c', { roughness: 0.4 }))
    brim.position.y = 0.3
    head.add(brim)
  } else {
    const cap = mesh(geo('oc-cap', () => new THREE.CylinderGeometry(0.24, 0.27, 0.16, 18)), mat('#8250df', { roughness: 0.7 }))
    cap.position.y = 0.4
    head.add(cap)
    const peak = rbox(0.3, 0.03, 0.18, mat('#1f2328'), 0.31, 0.01)
    peak.position.z = 0.24
    head.add(peak)
  }

  const load = new THREE.Group()
  load.add(rbox(0.36, 0.22, 0.26, mat('#f2c94c', { roughness: 0.75 }), 0, 0.03))
  load.add(rbox(0.05, 0.23, 0.27, mat('#8250df'), -0.005, 0.01))
  load.position.set(0, 0.5, 0.36)
  load.visible = false
  rig.add(load)
  return { group: g, rig, head, arms, legs, load }
}

/** Something for a cat to do: walk somewhere, face a way, and spend a while there. */
interface Task {
  to: THREE.Vector3
  face: number
  dwell: number
  /** Arms busy while there: working a machine's controls. */
  work?: boolean
  /** Picks up (true) or puts down (false) a parcel on arrival. */
  carry?: boolean
  say?: () => string | null
}

interface Cat {
  m: Octocat
  name: string
  next: () => Task
  task: Task | null
  /** When the cat is done at the task's spot; 0 while still walking there. */
  until: number
  speech: HTMLElement
  sayUntil: number
  phase: number
}

/** A repo's production line: its workflows' latest runs, the most urgent first. */
interface Line { repo: string; runs: GhRun[]; pos: THREE.Vector3 }

interface Lamp { m: THREE.MeshStandardMaterial; kind: 'running' | 'queued' | 'failure' | 'steady'; phase: number }
interface Belt { boxes: THREE.Object3D[]; gear: THREE.Object3D; beacon: THREE.Object3D; len: number; phase: number }
interface Smoke { puffs: THREE.Mesh[]; phase: number }
interface Author {
  fig: Figure
  /** 0 fine, 1 getting restless (over a day), 2 cross (over three days). */
  mood: 0 | 1 | 2
  phase: number
  speech: HTMLElement
  sayAt: number
  sayUntil: number
  lines: string[]
  /** Their place in the queue. */
  home: THREE.Vector3
  /** Where they're off to, a waypoint at a time; empty once there. */
  path: THREE.Vector3[]
  /** The lounge seat they have, or null while in the queue. */
  seat: Seat | null
  /** When they move on: back to the queue, or off to the lounge. */
  until: number
  /** Held in the lounge: a cup at the coffee bar or the cooler, a magazine on the sofa. */
  cup: THREE.Object3D
  mag: THREE.Object3D
  number: number
}

/** A place in the mailroom's lounge for an author to spend a while. */
interface Seat {
  kind: 'sofa' | 'coffee' | 'water'
  pos: THREE.Vector3
  /** The way to it from the walkway behind the queue, round the furniture. */
  via: THREE.Vector3
  face: number
  /** Seat height when sitting, or null when standing. */
  sit: number | null
  taken: boolean
}

/** The walkway behind the queue that authors cross the room on. */
const LANE_Z = 2.6

export class GithubHQ {
  readonly group = new THREE.Group()
  private dyn = new THREE.Group()
  /** The cats, kept out of `dyn` so they carry on walking while the rooms' contents are rebuilt. */
  private staff = new THREE.Group()
  private sign = floorText(16, 2.3, 'center')
  private board: ReturnType<typeof bigScreen>
  private boardAt = 0
  private extras: ReturnType<typeof floorText>[] = []
  private key = ''
  private data: HqData = { repos: [], pulls: [], runs: [] }
  private lamps: Lamp[] = []
  private belts: Belt[] = []
  private smoke: Smoke[] = []
  private authors: Author[] = []
  private cats: Cat[] = []
  /** Where each factory line stands, for the foremen to walk to. */
  private stations: Line[] = []
  private spots = new Map<string, THREE.Vector3>()
  /** Where each room's ceiling light hangs, from the group's origin, and the pool of light under it. */
  readonly glows: { at: THREE.Vector3; pool: THREE.MeshBasicMaterial }[] = []
  /** The mailroom lounge's places; they stay as the room's contents are rebuilt. */
  private seats: Seat[] = []

  constructor() {
    // High on the back wall, above the pipes and the back row's signs.
    this.board = bigScreen(6.6, 2.3, 2.6)
    this.buildShell()
    // The building itself never moves; what is in its rooms and the staff do.
    for (const o of this.group.children) freeze(o)
    this.group.add(this.dyn, this.staff)
    this.hireStaff()
  }

  /** Where a picked thing stands, in world space, for the camera to fly to. */
  where(id: string): THREE.Vector3 | null {
    const p = this.spots.get(id)
    return p ? this.group.localToWorld(p.clone()) : null
  }

  sync(d: HqData, now = Date.now()) {
    this.data = d
    this.paintSign(d)
    this.boardAt = 0
    const key = JSON.stringify([
      !!d.loading,
      d.pulls.map(p => [p.url, p.review, p.checks, p.review === 'mine' ? Math.min(2, Math.floor((now - p.createdAt) / DAY)) : 0]),
      d.runs.map(r => [r.repo, r.workflow, r.state]),
    ])
    if (key === this.key) return
    this.key = key
    this.clearDyn()
    this.buildMailroom(d.pulls, now, !!d.loading)
    this.buildFactory(d.runs, !!d.loading)
  }

  step(t: number, dt: number) {
    for (const l of this.lamps) {
      l.m.emissiveIntensity = l.kind === 'failure' ? 1.2 + Math.sin(t * 4 + l.phase) * 0.8
        : l.kind === 'running' ? ((t * 2 + l.phase) % 1 < 0.5 ? 2 : 0.4)
          : l.kind === 'queued' ? 0.6 + Math.sin(t * 1.5 + l.phase) * 0.3
            : 1.2
    }
    for (const b of this.belts) {
      b.gear.rotation.z -= dt * 3
      b.beacon.rotation.y += dt * 4
      b.boxes.forEach((box, i) => {
        box.position.x = (((t * 0.45 + b.phase + i / b.boxes.length) % 1) - 0.5) * b.len
      })
    }
    // Smoke rising from the chimneys of the machines that are running.
    for (const s of this.smoke) {
      s.puffs.forEach((p, i) => {
        const k = (t * 0.35 + s.phase + i / s.puffs.length) % 1
        p.position.y = 1.75 + k * 1.6
        p.position.x = 0.22 + Math.sin(k * 5 + i) * 0.12
        p.scale.setScalar(0.5 + k * 1.3)
        ;(p.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - k)
      })
    }
    for (const a of this.authors) this.stepAuthor(a, t, dt)
    for (const c of this.cats) this.stepCat(c, t, dt)
    if (t >= this.boardAt) {
      this.boardAt = t + 1
      this.paintBoard()
    }
  }

  dispose() {
    this.clearDyn()
    this.group.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove() })
  }

  // ------------------------------------------------------------ the building

  private buildShell() {
    const g = this.group
    const half = INNER / 2
    const v = (x: number, z: number) => new THREE.Vector2(x, z)

    // Its own ground: a dark slab under the rooms and the plaza in front.
    const pad = rbox(HQ_SIZE.w, 0.08, HQ_SIZE.d, mat('#2a2f3a', { roughness: 0.95 }), -0.06, 0.04)
    pad.castShadow = false
    pad.position.z = HQ_SIZE.cz
    g.add(pad)
    tag(pad, { kind: 'gh', id: 'hq' })

    const wall = dark('#30363d', 0.1)
    g.add(lowWall(v(-half, -WING_D / 2), v(half, -WING_D / 2), wall))
    g.add(lowWall(v(-half, -WING_D / 2), v(-half, WING_D / 2), wall))
    g.add(lowWall(v(half, -WING_D / 2), v(half, WING_D / 2), wall))
    for (const r of ROOMS.slice(1)) {
      const x = HQ_WINGS[r.id] - r.w / 2
      g.add(lowWall(v(x, -WING_D / 2), v(x, WING_D / 2), wall))
    }

    for (const r of ROOMS) {
      const x0 = HQ_WINGS[r.id]
      // The factory has a concrete floor; the mailroom a carpet in its colour.
      const floor = carpet(r.w - 0.3, WING_D - 0.3, r.id === 'runs' ? '#3b3f46' : dark(r.color, 0.8))
      floor.position.x = x0
      g.add(floor)
      tag(floor, { kind: 'gh', id: `wing:${r.id}` })
      this.spots.set(`wing:${r.id}`, new THREE.Vector3(x0, 0, 0))
      // The front wall, open in the middle for the door under the room's arch.
      g.add(lowWall(v(x0 - r.w / 2, WING_D / 2), v(x0 - 1.1, WING_D / 2), wall))
      g.add(lowWall(v(x0 + 1.1, WING_D / 2), v(x0 + r.w / 2, WING_D / 2), wall))
      const arch = doorArch(r.name, r.color)
      arch.position.set(x0, 0, WING_D / 2)
      g.add(arch)
      // As bright as a room with its lights on: GitHub never sleeps. The scene lends it a real light
      // when the camera is near; the pool on the floor carries the glow otherwise.
      const pool = lightPool(r.w, WING_D)
      pool.material.opacity = 0.22
      pool.mesh.position.x = x0
      g.add(pool.mesh)
      this.glows.push({ at: new THREE.Vector3(x0, 3.4, 0), pool: pool.material })
    }
    this.buildFactoryShell()
    this.buildLounge()

    // A gateway with the name on it, where the path from the office comes onto the plaza.
    const gate = doorArch('GitHub', '#24292f')
    gate.scale.setScalar(1.5)
    gate.position.set(-HQ_SIZE.w / 2 + 0.5, 0, HQ_PATH_Z)
    gate.rotation.y = Math.PI / 2
    g.add(gate)
    tag(gate, { kind: 'gh', id: 'hq' })
    this.spots.set('hq', new THREE.Vector3(0, 0, WING_D / 2 + 2))

    this.sign.plane.position.set(0, 0.07, WING_D / 2 + 2.3)
    g.add(this.sign.plane)
    tag(this.sign.plane, { kind: 'gh', id: 'hq' })
  }

  /** The factory's fixtures: pipes along the back wall and the "Now running" board. */
  private buildFactoryShell() {
    const x0 = HQ_WINGS.runs, w = ROOMS[1].w
    const pipe = mat('#6e7781', { roughness: 0.4, metalness: 0.6 })
    for (const [y, r] of [[2.3, 0.09], [2.6, 0.06]] as const) {
      const p = mesh(geo(`pipe:${r}`, () => new THREE.CylinderGeometry(r, r, w - 0.6, 12)), pipe)
      p.rotation.z = Math.PI / 2
      p.position.set(x0, y, -WING_D / 2 + 0.25)
      this.group.add(p)
    }
    for (const dx of [-w / 2 + 0.6, w / 2 - 0.6]) {
      const drop = mesh(geo('pipe-drop', () => new THREE.CylinderGeometry(0.09, 0.09, 2.3, 12)), pipe)
      drop.position.set(x0 + dx, 1.15, -WING_D / 2 + 0.25)
      this.group.add(drop)
    }
    const b = this.board
    b.group.position.set(x0, 2.6, -WING_D / 2 + 0.6)
    this.group.add(b.group)
    tag(b.group, { kind: 'gh', id: 'wing:runs' })
  }

  /**
   * The mailroom's lounge, in the front corners either side of the door: a sofa with a side table
   * of magazines on the left, a coffee bar and a water cooler on the right, and Mona's tea table
   * behind the counter.
   */
  private buildLounge() {
    const g = this.group
    const x0 = HQ_WINGS.pulls
    const v = (x: number, z: number) => new THREE.Vector3(x0 + x, 0, z)
    const put = (o: THREE.Object3D, x: number, z: number, ry = 0) => {
      o.position.set(x0 + x, 0, z)
      o.rotation.y = ry
      g.add(o)
      tag(o, { kind: 'gh', id: 'wing:pulls' })
      return o
    }

    // The sofa faces the counter, on a rug, with a side table of magazines and a mug.
    const rug = carpet(3.4, 1.9, '#5b3f8f')
    rug.position.set(x0 - 3.9, 0, 4.45)
    g.add(rug)
    put(sofa('#8250df'), -4.4, 4.75, Math.PI)
    const table = new THREE.Group()
    table.add(rbox(0.62, 0.5, 0.55, mat('#6b5440', { roughness: 0.8 }), 0, 0.04))
    ;['#f2c94c', '#54aeff', '#2da44e'].forEach((c, i) => {
      const m = rbox(0.34, 0.025, 0.26, mat(c, { roughness: 0.7 }), 0.5 + i * 0.026, 0.01)
      m.rotation.y = (i - 1) * 0.25
      m.position.x = -0.08
      table.add(m)
    })
    const mug = mesh(geo('mug', () => new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10)), mat('#e98a5b'))
    mug.position.set(0.18, 0.58, 0.1)
    table.add(mug)
    put(table, -2.95, 4.8)
    put(plant(41, 0.8), -5.5, 3.3)

    // Refreshments along the right wall, facing into the room.
    put(coffeeBar(), 5.5, 3.2, -Math.PI / 2)
    const cooler = new THREE.Group()
    cooler.add(rbox(0.42, 0.95, 0.42, mat('#e6edf3', { roughness: 0.5 }), 0, 0.05))
    const tap = mesh(boxGeo(0.08, 0.06, 0.06), mat('#54aeff'), false)
    tap.position.set(0, 0.75, 0.23)
    cooler.add(tap)
    const bottle = mesh(geo('cooler-bottle', () => new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16)), new THREE.MeshStandardMaterial({ color: '#7cc4ff', transparent: true, opacity: 0.6, roughness: 0.1 }))
    bottle.position.y = 1.2
    cooler.add(bottle)
    put(cooler, 5.45, 4.95, -Math.PI / 2)
    put(plant(77, 0.75), 5.45, 1.35)

    // Mona's tea table, in the back corner behind the counter.
    const tea = new THREE.Group()
    tea.add(rbox(0.7, 0.72, 0.6, mat('#6b5440', { roughness: 0.8 }), 0, 0.04))
    const pot = mesh(geo('teapot', () => new THREE.SphereGeometry(0.13, 16, 12)), mat('#f7f2e6', { roughness: 0.4 }))
    pot.scale.y = 0.8
    pot.position.set(-0.12, 0.84, 0)
    tea.add(pot)
    const cup = mesh(geo('mug', () => new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10)), mat('#8250df'))
    cup.position.set(0.16, 0.78, 0.08)
    tea.add(cup)
    put(tea, -5.3, -2.6)

    // Where authors go: two places on the sofa, the coffee bar and the cooler.
    for (const dx of [-0.45, 0.45]) this.seats.push({ kind: 'sofa', pos: v(-4.4 + dx, 4.6), via: v(-4.4 + dx, 3.6), face: Math.PI, sit: 0.08, taken: false })
    this.seats.push({ kind: 'coffee', pos: v(4.55, 3.2), via: v(3.6, 3.2), face: Math.PI / 2, sit: null, taken: false })
    this.seats.push({ kind: 'water', pos: v(4.75, 4.95), via: v(3.6, 4.95), face: Math.PI / 2, sit: null, taken: false })
  }

  /** The board over the factory: what is running and for how long, or how the latest runs went. */
  private paintBoard() {
    const c = this.board.canvas, x = c.getContext('2d')!
    const W = c.width, H = c.height
    x.fillStyle = '#0d1117'
    x.fillRect(0, 0, W, H)
    const runs = this.data.runs
    const going = runs.filter(live)
    const rows = going.length ? going : runs.filter(onFloor).slice(0, 5)
    x.textBaseline = 'middle'
    x.font = `800 ${H * 0.13}px ${FONT}`
    x.fillStyle = going.length ? '#f5b544' : '#2da44e'
    x.fillText(going.length ? `● NOW RUNNING · ${going.length}` : '✓ ALL QUIET · LATEST RUNS', W * 0.04, H * 0.12)
    const rh = H * 0.15
    rows.slice(0, 5).forEach((r, i) => {
      const y = H * 0.3 + i * rh
      x.fillStyle = i % 2 ? '#161b22' : '#11161d'
      x.fillRect(W * 0.03, y - rh / 2 + 4, W * 0.94, rh - 8)
      const color = RUN_COLOR[r.state]
      x.fillStyle = color
      x.beginPath()
      x.arc(W * 0.06, y, H * 0.025, 0, Math.PI * 2)
      x.fill()
      x.font = `700 ${H * 0.075}px ${FONT}`
      x.fillStyle = '#e6edf3'
      x.fillText(r.workflow, W * 0.09, y, W * 0.38)
      x.font = `500 ${H * 0.065}px ${FONT}`
      x.fillStyle = 'rgba(230,237,243,.6)'
      x.fillText(`${short(r.repo)} · ${r.branch}`, W * 0.48, y, W * 0.28)
      x.textAlign = 'right'
      x.fillStyle = color
      x.font = `700 ${H * 0.07}px ${FONT}`
      x.fillText(live(r) ? (r.state === 'queued' ? 'queued' : elapsed(Date.now() - r.startedAt)) : RUN_WORD[r.state], W * 0.95, y)
      x.textAlign = 'left'
    })
    if (!rows.length) {
      x.font = `500 ${H * 0.08}px ${FONT}`
      x.fillStyle = 'rgba(230,237,243,.5)'
      x.fillText(this.data.loading ? 'Reading GitHub…' : 'No workflow runs this week', W * 0.04, H * 0.45)
    }
    this.board.texture.needsUpdate = true
  }

  private paintSign(d: HqData) {
    const mine = d.pulls.filter(p => p.review === 'mine').length
    const going = d.runs.filter(live).length
    const empty = !d.pulls.length && !d.runs.length
    const line = d.error && empty
      ? `Can't read GitHub: ${d.error.slice(0, 70)}`
      : d.loading && empty
        ? 'Reading GitHub…'
        : `${d.pulls.length} open PRs · ${mine ? `${mine} waiting for you` : 'nothing waiting for you'} · ${going ? `${going} running` : 'no runs going'}${d.slowUntil ? ` · GitHub limit low, slowing down until ${new Date(d.slowUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
    if ((this.sign.plane.userData.key as string) === line) return
    this.sign.plane.userData.key = line
    this.sign.draw([
      { text: 'GitHub HQ', size: 1, color: 'rgba(230, 237, 243, .85)', weight: 700 },
      { text: line, size: 0.5, color: mine ? 'rgba(242, 201, 76, .9)' : 'rgba(230, 237, 243, .55)', weight: 500 },
    ])
  }

  private clearDyn() {
    this.dyn.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove() })
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o)
      disposeTree(o)
    }
    for (const e of this.extras) disposeTree(e.plane)
    this.extras = []
    this.lamps = []
    this.belts = []
    this.smoke = []
    this.authors = []
    for (const s of this.seats) s.taken = false
    this.stations = []
    for (const k of [...this.spots.keys()]) if (!k.startsWith('wing:') && k !== 'hq') this.spots.delete(k)
  }

  private lamp(color: string, kind: Lamp['kind'], r = 0.13) {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.3 })
    this.lamps.push({ m, kind, phase: Math.random() * Math.PI * 2 })
    return mesh(geo(`lamp:${r}`, () => new THREE.SphereGeometry(r, 16, 12)), m, false)
  }

  /** Text on the floor of a room, such as "+8 more". */
  private note(text: string, x: number, z: number, w = 5) {
    const f = floorText(w, 0.6, 'center')
    f.draw([{ text, size: 0.42, color: 'rgba(230, 237, 243, .6)', weight: 500 }])
    f.plane.position.set(x, 0.07, z)
    this.dyn.add(f.plane)
    this.extras.push(f)
  }

  /** A name chip and a speech bubble over someone's head. */
  private label(parent: THREE.Object3D, y: number, name: string, dot: string, what: string) {
    const el = document.createElement('div')
    el.className = 'sim-tag'
    const speech = document.createElement('div')
    speech.className = 'sim-say'
    speech.style.display = 'none'
    const chip = document.createElement('div')
    chip.className = 'sim-chip'
    const i = document.createElement('i')
    i.style.background = dot
    const b = document.createElement('b')
    b.textContent = name
    const s = document.createElement('span')
    s.textContent = what
    chip.append(i, b, s)
    el.append(speech, chip)
    const obj = new CSS2DObject(el)
    obj.position.set(0, y, 0)
    parent.add(obj)
    return speech
  }

  // ------------------------------------------------------------ the staff

  /** Mona runs the mailroom; Octo and Inky are the factory's foremen. */
  private hireStaff() {
    const mx = HQ_WINGS.pulls, fx = HQ_WINGS.runs
    this.addCat('Mona', 'post', new THREE.Vector3(mx, 0, -2), () => this.clerkTask())
    this.addCat('Octo', 'hard', new THREE.Vector3(fx - 3.5, 0, -1), () => this.foremanTask(0))
    this.addCat('Inky', 'hard', new THREE.Vector3(fx + 3.5, 0, 2), () => this.foremanTask(1))
  }

  private addCat(name: string, hat: 'post' | 'hard', pos: THREE.Vector3, next: () => Task) {
    const m = octocat(hat)
    m.group.position.copy(pos)
    this.staff.add(m.group)
    tag(m.group, { kind: 'gh', id: hat === 'post' ? 'wing:pulls' : 'wing:runs' })
    const speech = this.label(m.group, 1.75, name, hat === 'post' ? '#8250df' : '#f2c94c', hat === 'post' ? 'Mail clerk' : 'Foreman')
    this.cats.push({ m, name, next, task: null, until: 0, speech, sayUntil: 0, phase: hashOf(name) % 100 / 10 })
  }

  /** Mona: fetch a parcel from the pigeonholes, bring it to the counter, and say who is waiting. */
  private clerkTask(): Task {
    const x0 = HQ_WINGS.pulls
    const cat = this.cats[0]!
    // A quiet spell: nothing waiting for you, so a cup of tea in the corner now and then.
    if (!cat.m.load.visible && !this.data.pulls.some(p => p.review === 'mine') && Math.random() < 0.3) {
      return {
        to: new THREE.Vector3(x0 - 4.6, 0, -2.6), face: -Math.PI / 2, dwell: 6 + Math.random() * 4, work: true,
        say: () => pick(['Tea break ☕', 'Quiet day at the counter', 'Kettle’s on 🫖']),
      }
    }
    if (!cat.m.load.visible) {
      return { to: new THREE.Vector3(x0 + (Math.random() - 0.5) * 8, 0, -WING_D / 2 + 1.5), face: Math.PI, dwell: 1.3, work: true, carry: true }
    }
    return {
      to: new THREE.Vector3(x0 + (Math.random() - 0.5) * 6, 0, -0.45), face: 0, dwell: 2.2, carry: false,
      say: () => {
        if (Math.random() < 0.4) return null
        const pulls = this.data.pulls
        const mine = pulls.filter(p => p.review === 'mine').sort((a, b) => a.createdAt - b.createdAt)
        const oldest = mine[0]
        const lines = mine.length
          ? [`${mine.length} waiting for your review!`, `${oldest!.author} has waited ${waited(Date.now() - oldest!.createdAt)} 📬`, `#${oldest!.number} is on the counter`]
          : ['All caught up ✓', 'Nothing for you today 🙂']
        return pick([...lines, `${pulls.filter(p => p.review !== 'mine').length} PRs in the pigeonholes`, 'Sorting the post…'])
      },
    }
  }

  /** A foreman: go to a repo's machine (a busy or broken one most likely), work it, and say how it's going. */
  private foremanTask(n: number): Task {
    const st = this.stations
    if (!st.length) {
      const x0 = HQ_WINGS.runs
      return { to: new THREE.Vector3(x0 + (Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 7), face: Math.random() * 6, dwell: 3, say: () => (Math.random() < 0.3 ? 'Quiet shift today' : null) }
    }
    // Weighted: running lines need the most attention, then failed ones; the two foremen split the floor.
    const weight = (l: Line) => [4, 3, 2, 1, 1, 1][URGENCY[l.runs[0]!.state]]!
    const pool = st.flatMap(l => Array(weight(l)).fill(l) as Line[])
    const half = pool.filter(l => (l.pos.x < HQ_WINGS.runs) === (n === 0))
    const l = pick(half.length ? half : pool)
    // Talk about the run that matters most on this line, or now and then another one.
    const r = Math.random() < 0.7 ? l.runs[0]! : pick(l.runs)
    const repo = short(l.repo)
    return {
      to: l.pos.clone().add(new THREE.Vector3(-0.85, 0, -0.4)), face: Math.PI / 2, dwell: 3.5 + Math.random() * 2, work: true,
      say: () => r.state === 'running'
        ? pick([`Running ${r.workflow} on ${repo}…`, `${repo} ${r.workflow}: ${elapsed(Date.now() - r.startedAt)} in`, 'Keep that belt moving!'])
        : r.state === 'failure'
          ? pick([`${r.workflow} failed on ${repo} 💥`, `Someone look at ${repo}!`])
          : r.state === 'queued'
            ? `${repo} ${r.workflow} is queued`
            : r.state === 'success'
              ? (Math.random() < 0.5 ? `${repo} ${r.workflow} passed ✅` : null)
              : null,
    }
  }

  private stepCat(c: Cat, t: number, dt: number) {
    const m = c.m
    if (!c.task) {
      c.task = c.next()
      c.until = 0
    }
    const task = c.task
    const pos = m.group.position
    const d = toward.copy(task.to).setY(0).sub(pos)
    const dist = d.length()
    if (!c.until && dist > 0.05) {
      // Walking: tentacles paddling, a little bob, turned the way it's going.
      const stepLen = Math.min(dist, 1.5 * dt)
      pos.add(d.normalize().multiplyScalar(stepLen))
      const want = Math.atan2(d.x, d.z)
      m.group.rotation.y += Math.atan2(Math.sin(want - m.group.rotation.y), Math.cos(want - m.group.rotation.y)) * Math.min(1, dt * 10)
      m.rig.position.y = Math.abs(Math.sin(t * 9 + c.phase)) * 0.06
      m.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 12 + i * 1.3) * 0.35 })
      m.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 9 + i * Math.PI) * 0.4 })
      return
    }
    if (!c.until) {
      // Arrived: face the work, pick up or put down, maybe say something.
      c.until = t + task.dwell
      if (task.carry !== undefined) m.load.visible = task.carry
      const line = task.say?.()
      if (line) {
        c.speech.textContent = line
        c.speech.style.display = ''
        c.sayUntil = t + 3.8
      }
    }
    const want = task.face
    m.group.rotation.y += Math.atan2(Math.sin(want - m.group.rotation.y), Math.cos(want - m.group.rotation.y)) * Math.min(1, dt * 6)
    m.rig.position.y = 0
    m.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 2 + i) * 0.08 })
    if (task.work) {
      // Busy with both arms: pulling levers, pressing buttons, sorting.
      m.arms[0].rotation.x = -0.9 + Math.sin(t * 7 + c.phase) * 0.45
      m.arms[1].rotation.x = -0.9 + Math.sin(t * 7 + c.phase + 2) * 0.45
      m.head.rotation.x = 0.15
    } else {
      m.arms.forEach((a, i) => { a.rotation.x = m.load.visible ? -1 : Math.sin(t * 1.5 + i) * 0.1 })
      m.head.rotation.x = 0
    }
    if (c.sayUntil && t >= c.sayUntil) {
      c.speech.style.display = 'none'
      c.sayUntil = 0
    }
    if (t >= c.until) c.task = null
  }

  // ------------------------------------------------------------ the PR mailroom

  private buildMailroom(pulls: GhPull[], now: number, loading: boolean) {
    const x0 = HQ_WINGS.pulls
    const wood = mat('#6b5440', { roughness: 0.8 })

    // Pigeonholes along the back wall: ten across, three high.
    const rack = new THREE.Group()
    rack.position.set(x0, 0, -WING_D / 2 + 0.55)
    const RW = 10.2, CW = 1.02, CH = 0.52, RD = 0.55
    rack.add(rbox(RW, 0.2, RD, wood, 0, 0.03))
    for (let row = 0; row <= 3; row++) rack.add(rbox(RW, 0.04, RD, wood, 0.2 + row * CH, 0.01))
    for (let col = 0; col <= 10; col++) {
      const div = rbox(0.04, CH * 3, RD, wood, 0.2, 0.01)
      div.position.x = -RW / 2 + col * CW
      rack.add(div)
    }
    this.dyn.add(rack)

    const others = pulls.filter(p => p.review !== 'mine').sort((a, b) => b.createdAt - a.createdAt)
    others.slice(0, MAX_CUBBIES).forEach((p, i) => {
      const col = i % 10, row = Math.floor(i / 10)
      const parcel = this.parcel(p, 0.62, 0.3, 0.36)
      const pos = new THREE.Vector3(-RW / 2 + CW / 2 + col * CW, 0.24 + (2 - row) * CH, 0.02)
      parcel.position.copy(pos)
      rack.add(parcel)
      tag(parcel, { kind: 'gh', id: `pr:${p.url}` })
      this.spots.set(`pr:${p.url}`, rack.position.clone().add(pos))
    })
    if (others.length > MAX_CUBBIES) this.note(`+${others.length - MAX_CUBBIES} more open PRs`, x0, -WING_D / 2 + 1.5)

    // The counter, with the parcels waiting for the user's review on top and their authors queueing in front.
    const counter = new THREE.Group()
    counter.position.set(x0, 0, 0.4)
    counter.add(rbox(8, 1, 0.8, wood, 0, 0.05))
    counter.add(rbox(8.2, 0.06, 0.95, mat('#d9c7a8', { roughness: 0.5 }), 1, 0.02))
    this.dyn.add(counter)

    const mine = pulls.filter(p => p.review === 'mine').sort((a, b) => a.createdAt - b.createdAt)
    // Before the first read there's nothing to say yet, rather than "nothing waiting".
    if (!mine.length) this.note(loading && !pulls.length ? 'Reading GitHub…' : 'Nothing waiting for your review ✓', x0, 2.2, 7)
    const shown = mine.slice(0, 8)
    shown.forEach((p, i) => {
      const parcel = this.parcel(p, 0.62, 0.38, 0.46)
      const x = (i - (shown.length - 1) / 2) * 0.9
      parcel.position.set(x, 1.06, 0)
      parcel.rotation.y = (hashOf(p.url) % 7 - 3) * 0.05
      counter.add(parcel)
      tag(parcel, { kind: 'gh', id: `pr:${p.url}` })
      this.spots.set(`pr:${p.url}`, counter.position.clone().add(new THREE.Vector3(x, 1.2, 0)))
    })
    if (mine.length > shown.length) this.note(`+${mine.length - shown.length} more waiting for you`, x0, 1.3)

    // One person per author, at their oldest parcel.
    const byAuthor = new Map<string, GhPull[]>()
    for (const p of mine) byAuthor.set(p.author, [...(byAuthor.get(p.author) || []), p])
    ;[...byAuthor.values()].slice(0, MAX_QUEUE).forEach((prs, i, all) => {
      const oldest = prs[0]!
      const x = x0 + (i - (all.length - 1) / 2) * 1.9
      this.addAuthor(oldest, prs, new THREE.Vector3(x, 0, 1.75), now)
    })
  }

  private parcel(p: GhPull, w: number, h: number, d: number) {
    const g = new THREE.Group()
    g.add(rbox(w, h, d, mat(REVIEW_COLOR[p.review], { roughness: 0.75 }), 0, 0.03))
    // Tape round it, and a ribbon on the ones waiting for the user.
    const tape = mat(p.review === 'mine' ? '#8250df' : '#e8dcc0', { roughness: 0.6 })
    g.add(rbox(0.08, h + 0.01, d + 0.01, tape, -0.005, 0.01))
    if (p.review === 'mine') g.add(rbox(w + 0.01, h + 0.01, 0.08, tape, -0.005, 0.01))
    // A sticker for checks that failed or are still running.
    if (p.checks === 'fail' || p.checks === 'pending') {
      const c = p.checks === 'fail' ? '#ff4d4f' : '#f5b544'
      const s = mesh(roundGeo(0.16, 0.1, 0.01, 0.004), mat(c, { emissive: c, emissiveIntensity: 0.6 }), false)
      s.position.set(w * 0.22, h * 0.6, d / 2 + 0.006)
      g.add(s)
    }
    return g
  }

  private addAuthor(p: GhPull, prs: GhPull[], pos: THREE.Vector3, now: number) {
    const age = now - p.createdAt
    const mood: Author['mood'] = age > 3 * DAY ? 2 : age > DAY ? 1 : 0
    const fig = figure({ seed: hashOf(p.author), role: hashOf(p.author) % 3 ? 'developer' : 'designer' })
    fig.group.position.copy(pos)
    // Facing the counter.
    fig.group.rotation.y = Math.PI
    this.dyn.add(fig.group)
    tag(fig.group, { kind: 'gh', id: `pr:${p.url}` })
    const speech = this.label(fig.group, 2.25, p.author, mood === 2 ? '#ff4d4f' : mood === 1 ? '#f5b544' : '#2da44e',
      prs.length > 1 ? `${prs.length} PRs · ${waited(age)}` : `#${p.number} · ${waited(age)}`)

    const n = `#${p.number}`
    const lines = mood === 2
      ? [`Still waiting on ${n}… ⏳`, `${n} has waited ${waited(age)}!`, 'Hello? Anyone? 😤', `Can ${n} go out today?`]
      : mood === 1
        ? [`Any chance to look at ${n} today?`, `${n} is ready for you 👀`, 'Just checking in on my PR']
        : [`Got a minute for ${n}?`, `No rush on ${n} 🙂`, 'Fresh PR for you!']
    const phase = (hashOf(p.url) % 1000) / 100
    // A cup in the right hand and a magazine in the left, shown in the lounge.
    const cup = mesh(geo('mug', () => new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10)), mat(pick(['#e98a5b', '#ffffff', '#8fb7a0', '#7cc4ff'])))
    cup.position.set(0, -0.47, 0.03)
    cup.visible = false
    fig.arms[1].add(cup)
    const mag = rbox(0.3, 0.02, 0.22, mat(pick(['#f2c94c', '#54aeff', '#2da44e']), { roughness: 0.7 }), 0, 0.005)
    mag.position.set(0.12, -0.44, 0.08)
    mag.rotation.x = 1.2
    mag.visible = false
    fig.arms[0].add(mag)
    this.authors.push({
      fig, mood, phase, speech, sayAt: 3 + phase, sayUntil: 0, lines, home: pos.clone(), path: [], seat: null,
      until: 4 + phase * 1.5, cup, mag, number: p.number,
    })
  }

  /**
   * Off to the lounge, or not: the fresh ones wander most, the cross ones hardly leave the counter
   * (and only for water). The way there is along the walkway behind the queue, then round the furniture.
   */
  private wander(a: Author, t: number) {
    const leave = [0.6, 0.35, 0.1][a.mood]!
    const free = this.seats.filter(s => !s.taken && (a.mood < 2 || s.kind === 'water'))
    if (!free.length || Math.random() > leave) {
      a.until = t + 8 + Math.random() * 10
      return
    }
    const seat = pick(free)
    seat.taken = true
    a.seat = seat
    a.path = [new THREE.Vector3(a.home.x, 0, LANE_Z), new THREE.Vector3(seat.via.x, 0, LANE_Z), seat.via.clone(), seat.pos.clone()]
    a.until = 0
  }

  /** Back to their place in the queue, the way they came. */
  private goBack(a: Author) {
    const seat = a.seat!
    a.path = [seat.via.clone(), new THREE.Vector3(seat.via.x, 0, LANE_Z), new THREE.Vector3(a.home.x, 0, LANE_Z), a.home.clone()]
    seat.taken = false
    a.seat = null
    a.until = 0
    a.cup.visible = a.mag.visible = false
    // What they said about the lounge stays there.
    a.speech.style.display = 'none'
    a.sayUntil = 0
  }

  /** What they say in the lounge, now and then. */
  private loungeLine(a: Author) {
    const n = `#${a.number}`
    const kind = a.seat?.kind
    if (kind === 'sofa') return pick(['Catching up on the release notes 📖', `I'll wait here for ${n}`, 'Comfy sofa, this', 'Reading about monorepos…'])
    if (kind === 'coffee') return pick(['Coffee while I wait ☕', 'One more espresso', `Fuel for ${n}`])
    return pick(['Staying hydrated 💧', 'Water break', 'Any news on my PR?'])
  }

  private stepAuthor(a: Author, t: number, dt: number) {
    const f = a.fig
    const [la, ra] = f.arms
    const turnTo = (want: number, rate: number) => {
      f.group.rotation.y += Math.atan2(Math.sin(want - f.group.rotation.y), Math.cos(want - f.group.rotation.y)) * Math.min(1, dt * rate)
    }
    // Start each frame from standing still.
    f.rig.position.set(0, 0, 0)
    f.rig.rotation.set(0, 0, 0)
    f.body.rotation.set(0, 0, 0)
    f.head.rotation.set(0, 0, 0)
    f.legs.forEach(l => l.rotation.set(0, 0, 0))
    la.rotation.set(0, 0, -0.12)
    ra.rotation.set(0, 0, 0.12)

    if (a.path.length) {
      // Walking: legs and arms swinging, a little bob, turned the way they're going.
      const to = a.path[0]!
      const pos = f.group.position
      const d = to.clone().sub(pos).setY(0)
      const dist = d.length()
      if (dist > 0.05) {
        pos.add(d.normalize().multiplyScalar(Math.min(dist, 1.4 * dt)))
        turnTo(Math.atan2(d.x, d.z), 10)
        f.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 10 + i * Math.PI) * 0.5 })
        la.rotation.x = Math.sin(t * 10 + Math.PI) * 0.4
        ra.rotation.x = Math.sin(t * 10) * 0.4
        f.rig.position.y = Math.abs(Math.sin(t * 10)) * 0.04
        return
      }
      a.path.shift()
      if (a.path.length) return
      // Arrived: settle in at the lounge for a while, or back in the queue.
      if (a.seat) {
        a.until = t + (a.seat.kind === 'sofa' ? 14 + Math.random() * 12 : 7 + Math.random() * 5)
        a.cup.visible = a.seat.kind !== 'sofa'
        a.mag.visible = a.seat.kind === 'sofa'
        if (Math.random() < 0.6) a.sayAt = t + 1
      } else a.until = t + 8 + Math.random() * 10
    }

    if (a.seat) {
      // In the lounge: reading on the sofa, or sipping at the bar or the cooler.
      const seat = a.seat
      turnTo(seat.face, 6)
      const ph = t + a.phase
      if (seat.sit !== null) {
        f.rig.position.set(0, seat.sit, -0.08)
        f.legs.forEach((l) => { l.rotation.x = -1.45 })
        la.rotation.x = -1.15
        ra.rotation.x = -1.05
        f.head.rotation.x = 0.25 + Math.sin(ph * 0.5) * 0.04
        f.body.rotation.x = -0.08
      } else {
        const sip = (ph % 6) < 1.3
        ra.rotation.x = sip ? -2.4 : -0.9
        f.head.rotation.x = sip ? -0.2 : 0
        f.rig.rotation.z = Math.sin(t * 1.1 + a.phase) * 0.02
      }
      if (t >= a.until) this.goBack(a)
    } else {
      // In the queue: a gentle sway; restless: tapping a foot and looking about; cross: hands on hips, bouncing.
      turnTo(Math.PI, 6)
      f.rig.rotation.z = Math.sin(t * 1.2 + a.phase) * 0.03
      // The restless ones glance back over their shoulder, as if for the reviewer.
      f.head.rotation.y = a.mood >= 1 ? Math.sin(t * 0.6 + a.phase) * 1.1 : 0
      f.legs[1].rotation.x = a.mood >= 1 && Math.sin(t * 0.5 + a.phase) > 0 ? Math.max(0, Math.sin(t * 9)) * -0.3 : 0
      if (a.mood === 2) {
        la.rotation.set(-0.25, 0, -0.55)
        ra.rotation.set(-0.25, 0, 0.55)
        f.rig.position.y = Math.abs(Math.sin(t * 3 + a.phase)) * 0.05
      }
      if (a.until && t >= a.until) this.wander(a, t)
    }

    // Something to say every so often; the cross ones more often, and in the lounge about the lounge.
    if (t >= a.sayAt) {
      a.speech.textContent = a.seat ? this.loungeLine(a) : pick(a.lines)
      a.speech.style.display = ''
      a.sayUntil = t + 4.5
      a.sayAt = t + (a.mood === 2 ? 9 : a.mood === 1 ? 16 : 26) + Math.random() * 8
    }
    if (a.sayUntil && t >= a.sayUntil) {
      a.speech.style.display = 'none'
      a.sayUntil = 0
    }
  }


  // ------------------------------------------------------------ the workflow factory

  /**
   * One production line per repo, for the latest run of each of its workflows: the repos with a run
   * going first, then those with a failure, then the most recently busy.
   */
  private buildFactory(runs: GhRun[], loading: boolean) {
    const x0 = HQ_WINGS.runs
    const byRepo = new Map<string, GhRun[]>()
    for (const r of runs.filter(onFloor)) byRepo.set(r.repo, [...(byRepo.get(r.repo) || []), r])
    const lines = [...byRepo].map(([repo, rs]) => ({
      repo, runs: rs.sort((a, b) => URGENCY[a.state] - URGENCY[b.state] || b.startedAt - a.startedAt),
    })).sort((a, b) => URGENCY[a.runs[0]!.state] - URGENCY[b.runs[0]!.state] || b.runs[0]!.startedAt - a.runs[0]!.startedAt)
    if (!lines.length) this.note(loading ? 'Reading GitHub…' : 'No workflow runs this week', x0, 1.5, 6)
    if (lines.length > MAX_STATIONS) this.note(`+${lines.length - MAX_STATIONS} more repos`, x0, WING_D / 2 - 0.6)
    lines.slice(0, MAX_STATIONS).forEach((l, i) => {
      const pos = new THREE.Vector3(x0 + COLS[i % 4]!, 0, ROWS[Math.floor(i / 4)]!)
      const { group, lamps } = this.station(l.repo, l.runs, i)
      group.position.copy(pos)
      this.dyn.add(group)
      // The machine opens the repo; each lamp opens its own workflow's run.
      tag(group, { kind: 'gh', id: `repo:${l.repo}` })
      this.spots.set(`repo:${l.repo}`, pos.clone().setY(0.8))
      for (const { lamp, run } of lamps) {
        tag(lamp, { kind: 'gh', id: `run:${run.repo}|${run.workflow}` })
        this.spots.set(`run:${run.repo}|${run.workflow}`, pos.clone().setY(1.4))
      }
      this.stations.push({ ...l, pos })
    })
  }

  private station(repo: string, runs: GhRun[], i: number) {
    const g = new THREE.Group()
    const L = 2.6
    const top = runs[0]!
    const going = runs.some(r => r.state === 'running')
    const broken = runs.some(r => r.state === 'failure')
    g.add(hazard(1.9, L + 0.5))

    // The belt runs along z, towards the door: built along x, then turned.
    const line = new THREE.Group()
    line.rotation.y = -Math.PI / 2
    g.add(line)
    const frame = mat('#3b424d', { roughness: 0.6, metalness: 0.3 })
    for (const x of [-L / 2 + 0.2, L / 2 - 0.2]) {
      const leg = rbox(0.1, 0.42, 0.5, frame, 0, 0.02)
      leg.position.x = x
      line.add(leg)
    }
    line.add(rbox(L, 0.08, 0.62, mat('#1f2328', { roughness: 0.9 }), 0.42, 0.03))
    for (const x of [-L / 2, L / 2]) {
      const roller = mesh(geo('roller', () => new THREE.CylinderGeometry(0.06, 0.06, 0.64, 12)), frame)
      roller.rotation.x = Math.PI / 2
      roller.position.set(x, 0.46, 0)
      line.add(roller)
    }

    // The machine part-way along: red while any of the repo's workflows last failed, its gear facing the door.
    const body = mat(broken ? '#6b2b30' : going ? '#55606f' : '#4a5361', { roughness: 0.5, metalness: 0.2 })
    const machine = rbox(1, 1.15, 0.95, body, 0.2, 0.08)
    machine.position.z = -0.4
    g.add(machine)
    // A chimney that smokes while a run is going.
    const chimney = mesh(geo('chimney', () => new THREE.CylinderGeometry(0.1, 0.13, 0.5, 12)), mat('#30363d', { roughness: 0.6 }))
    chimney.position.set(0.22, 1.6, -0.55)
    g.add(chimney)
    const gear = mesh(geo('gear', () => new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8)), mat('#c9d1d9', { metalness: 0.5, roughness: 0.4 }), false)
    gear.rotation.x = Math.PI / 2
    const spinner = new THREE.Group()
    spinner.position.set(0, 0.95, 0.09)
    spinner.add(gear)
    g.add(spinner)

    // A lamp per workflow along the machine's top front edge, the most urgent on the left.
    const shown = runs.slice(0, MAX_LAMPS)
    const lamps = shown.map((r, k) => {
      const kind: Lamp['kind'] = r.state === 'running' ? 'running' : r.state === 'queued' ? 'queued' : r.state === 'failure' ? 'failure' : 'steady'
      const lamp = this.lamp(RUN_COLOR[r.state], kind, 0.085)
      lamp.position.set((k - (shown.length - 1) / 2) * 0.19, 1.42, -0.05)
      g.add(lamp)
      return { lamp, run: r }
    })

    // Boxes travelling along and a turning beacon while a run goes; a finished box at the near end otherwise.
    const crate = mat('#c8a46e', { roughness: 0.8 })
    if (going) {
      const boxes: THREE.Object3D[] = []
      for (let k = 0; k < 3; k++) {
        const b = rbox(0.3, 0.26, 0.3, crate, 0.5, 0.03)
        line.add(b)
        boxes.push(b)
      }
      const beacon = new THREE.Group()
      beacon.position.set(-0.25, 1.55, -0.65)
      for (const s of [-1, 1]) {
        const flap = mesh(boxGeoish(), mat('#f5b544', { emissive: '#f5b544', emissiveIntensity: 2, transparent: true, opacity: 0.85 }), false)
        flap.position.x = s * 0.16
        beacon.add(flap)
      }
      g.add(beacon)
      this.belts.push({ boxes, gear: spinner, beacon, len: L - 0.4, phase: i * 0.37 })
      const puffMat = new THREE.MeshStandardMaterial({ color: '#c9d1d9', transparent: true, opacity: 0.5, depthWrite: false, roughness: 1 })
      const puffs = Array.from({ length: 5 }, () => {
        const p = mesh(geo('puff', () => new THREE.SphereGeometry(0.12, 10, 8)), puffMat, false)
        p.position.z = -0.55
        g.add(p)
        return p
      })
      this.smoke.push({ puffs, phase: i * 0.21 })
    } else if (top.state !== 'queued') {
      const done = rbox(0.34, 0.3, 0.34, mat(top.state === 'success' ? '#2da44e' : top.state === 'failure' ? '#cf222e' : '#8c959f', { roughness: 0.7 }), 0.5, 0.03)
      done.position.x = L / 2 - 0.3
      if (top.state === 'failure') done.rotation.z = 0.35
      line.add(done)
    }

    // The repo up high where it can be read from across the floor, and under it the workflows that
    // need a look (running or failed), or how many there are when all is well. Colour says how it's going.
    const busy = runs.filter(r => r.state === 'running' || r.state === 'failure').map(r => r.workflow)
    const sub = busy.length ? busy.slice(0, 2).join(', ') + (busy.length > 2 ? ` +${busy.length - 2}` : '') : runs.length === 1 ? top.workflow : `${runs.length} workflows`
    const sign = plate(short(repo), 2.2, 0.62, going ? '#3d2f05' : broken ? '#3b1214' : '#161b22', '#e6edf3', sub)
    sign.position.set(0, 2.25, -0.4)
    sign.rotation.x = -0.3
    g.add(sign)
    const strip = mesh(roundGeo(2.2, 0.06, 0.02, 0.01), mat(RUN_COLOR[top.state], { emissive: RUN_COLOR[top.state], emissiveIntensity: 0.8 }), false)
    strip.position.set(0, 1.94, -0.33)
    strip.rotation.x = -0.3
    g.add(strip)
    return { group: g, lamps }
  }
}

/** A beacon's lit side: a small flat panel. */
function boxGeoish() {
  return geo('beacon-flap', () => new THREE.BoxGeometry(0.06, 0.16, 0.12))
}
