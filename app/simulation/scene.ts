import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { Act, Status, ToolResult } from '#shared/types'
import type { Sky } from '~/composables/useWeather'
import {
  airHockey, arcade, beanBag, bigScreen, blueprintGround, boardGame, book, boxGeo, carpet, coffeeBar, consoleBench, controller, cue, dartboard, deskPod, disposeKit,
  disposeTree, doorArch, drumKit, drumstick, type Figure, figure, floorLamp, floorText, FONT, foosball, freeze, geo, guitar, hashOf, lightPillar, lightPool, lowWall, mat,
  mesh, micStand, oklch, type Pick, pingPong, plant, poolTable, rbox, type Role, seeded, runeCircle, type Seat, sofa, spark, speaker, stage, stringLights, tag, tint, woodFloor,
} from './kit'
import { GithubHQ, HQ_PATH_Z, HQ_SIZE, type HqData } from './github'
import { AwsDataCentre, DC_PATH_Z, DC_SIZE, type DcData } from './aws'

/**
 * The Canopy workspace as an open-plan office. Each project is a room behind low walls in its
 * colour, with its name on the arch over the door and on the floor outside. Each Claude session
 * is a developer or a designer: at their desk while Claude works or waits on you, off to the
 * common room for football, games, the day's table games or a coffee while it is idle. Subagents are smaller
 * helpers standing behind the one who started them. New people are summoned in a rune circle;
 * a room's lights are on while it has a session open. In front of the common room a rock band
 * plays on a stage, and idle people drift between the band, the games and the coffee.
 * Vue hands it the state with `sync()`; everything that moves is worked out here, every frame.
 */

export type { Pick } from './kit'

export interface SimRoom {
  id: string
  name: string
  hue: number
  /** Live numbers painted on the room's big screen. */
  stats: { sessions: number; working: number; waiting: number; subagents: number; today: string }
}

export interface SimPerson {
  id: string
  roomId: string
  /** For a subagent: the session that started it. */
  parentId: string | null
  name: string
  role: Role
  status: Status
  /** What they are on, for the card over their head. */
  title: string
  /** Claude's latest line or tool call, said over their head while they work. */
  line: { text: string; kind: 'said' | 'doing'; at: number } | null
  /** The kind of tool Claude is using, acted out at the desk, and how its latest command went. */
  act: Act | ''
  result: ToolResult | null
}

export interface SimHover { pick: Pick; x: number; y: number }

/** Canopy's own health, for the Canopy Core in the corner of the stage area. */
export interface SimMetrics {
  memMB: number
  /** Percent of the whole machine. */
  cpu: number
  lagMs: number
  lagMaxMs: number
  /** Frames the 3D World draws a second. */
  fps: number
  ptys: number
  /** The last two minutes, oldest first. */
  history: { memMB: number; cpu: number; fps: number; lagMs: number }[]
}

export interface SceneOptions {
  container: HTMLElement
  onHover: (hover: SimHover | null) => void
  /** Frames drawn in the last second, about once a second while the view is open. */
  onFps?: (fps: number) => void
  onSelect: (pick: Pick | null) => void
  /** A right click on someone, at a point in the view. */
  onMenu: (menu: SimHover) => void
  /** Someone sent off with `farewell()` has said goodbye: their session can close now. */
  onFarewell: (id: string) => void
}

const ROOM_D = 9
const HALL = 3.2
const POD_Z = 0.2
/** Depth of the common room in front of the first row of rooms. */
const COMMON_D = 13
/** Depth of the stage area in front of the common room. */
const STAGE_D = 10
const STAGE_H = 0.5
/** One song and the break after it, in seconds. */
const SONG = 34
const ENCORE = 7
/** The x of the two clear lanes through the common room and past either side of the stage. */
const STAGE_LANE = 7.2
/** Open ground between the office and GitHub HQ, and the AWS data centre on the other side. */
const HQ_GAP = 7
const WALK_SPEED = 2.4
/**
 * Real lights lent to the lit rooms nearest the camera; the rest glow with their lamps and the pool
 * on the floor. A fixed number, so shaders never recompile as rooms come and go.
 */
const LIGHT_SLOTS = 3
/** Frames a second while nothing moves the camera, and for how long after the pointer does. */
const AMBIENT_FPS = 30
const BUSY_MS = 1000
/** How often the sun's shadows are drawn again: people move, the furniture does not. */
const SHADOW_HZ = 12
const BACKGROUND = new THREE.Color('#1b1924')

/** The lighting at night, at dusk and dawn, and in the day: the scene blends between them by the hour. */
const LIGHT = {
  night: { bg: new THREE.Color('#0d0c15'), hemi: new THREE.Color('#8a8fd6'), hemiI: 0.2, sun: new THREE.Color('#9fb4ff'), sunI: 0.16 },
  dusk: { bg: BACKGROUND, hemi: new THREE.Color('#d6d0ff'), hemiI: 0.5, sun: new THREE.Color('#ffd9b0'), sunI: 0.75 },
  day: { bg: new THREE.Color('#4d6684'), hemi: new THREE.Color('#eef3ff'), hemiI: 0.8, sun: new THREE.Color('#fff3df'), sunI: 1.2 },
}
/** How much each kind of weather dims the sun. */
const OVERCAST: Record<Sky, number> = { clear: 1, cloudy: 0.5, fog: 0.55, rain: 0.4, snow: 0.6, storm: 0.25 }
const STATUS_COLOR: Record<Status, string> = { working: '#5b9cff', waiting: '#f5b544', done: '#4cc38a', idle: '#9aa0ab' }
const ROLE_LABEL: Record<Role, string> = { developer: 'Dev', designer: 'Design' }
/** The Canopy Core's rack lights, and the height of the racks' tops, where the smoke comes off. */
const LED = { off: new THREE.Color('#1a2a22'), ok: new THREE.Color('#4cc38a'), info: new THREE.Color('#8fd6ff'), warn: new THREE.Color('#f5b544'), hot: new THREE.Color('#ff4d4f') }
const RACK_TOP = 2.2

/** Running hot: the main thread lagging badly, or the CPU flat out. */
function coreHot(m: SimMetrics | null) {
  return !!m && (m.lagMs > 30 || m.lagMaxMs > 150 || m.cpu > 85)
}

type RoomActor = {
  data: SimRoom
  center: THREE.Vector3
  width: number
  row: number
  podHalf: number
  seats: Seat[]
  color: string
  /** The project colour, darker, for text painted on the wood floor. */
  ink: string
  lit: number
  on: boolean
  switchedAt: number
  glow: Glow
  lamp: THREE.MeshStandardMaterial
  monitors: THREE.MeshStandardMaterial
  pool: THREE.MeshBasicMaterial
  screen: ReturnType<typeof bigScreen>
  screenKey: string
  floor: ReturnType<typeof floorText>
}

/** Somewhere lit that can borrow one of the real lights: a room with its lights on, or a room in GitHub HQ. */
type Glow = {
  at: THREE.Vector3
  color: string
  /** The real light's full brightness. */
  strength: number
  /** How lit the place is now, 0 to 1. */
  level: () => number
  /** How much of a real light it has now, 0 to 1, as one fades in or out. */
  real: number
  /** A pool of light on the floor that glows brighter without a real light; rooms see to their own. */
  pool?: THREE.MeshBasicMaterial
}

type LightSlot = { light: THREE.PointLight; glow: Glow | null; k: number }

type SpotKind = 'sofa' | 'bean' | 'game' | 'pong' | 'foos' | 'pool' | 'hockey' | 'board' | 'coffee' | 'arcade' | 'darts' | 'chat' | 'crowd'

/** What can stand on the common room's two tables in the middle, and in its front corner. */
const TABLES = ['pong', 'foos', 'pool', 'hockey', 'board'] as const
const CORNERS = ['arcade', 'darts'] as const
type Table = (typeof TABLES)[number]
type Corner = (typeof CORNERS)[number]

/** Every pair of tables, in a fixed shuffled order, so each day brings out a different pair. */
const PAIRS: [Table, Table][] = (() => {
  const pairs: [Table, Table][] = []
  TABLES.forEach((a, i) => TABLES.slice(i + 1).forEach(b => pairs.push([a, b])))
  const rand = seeded(20261008)
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!]
  }
  return pairs
})()

/** The common room's lineup on a day: a pair of tables (swapping sides every other round) and the corner game. */
export function lineupFor(day: number): { tables: [Table, Table]; corner: Corner } {
  const round = Math.floor(day / PAIRS.length)
  const [a, b] = PAIRS[day % PAIRS.length]!
  return { tables: round % 2 ? [b, a] : [a, b], corner: CORNERS[(day + round) % CORNERS.length]! }
}

/** Today as a count of days, by the local calendar, so the common room changes at midnight. */
const dayNumber = (at = new Date()) => Math.floor(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / 86_400_000)

/** Somewhere in the common room to spend idle time. */
type Spot = {
  kind: SpotKind
  x: number
  z: number
  face: number
  /** Where the rig sits for a seat; null to stand. */
  sit: number | null
  /** The x of the clear lane walked down from the walkway to reach it. */
  lane: number
  /** Which screen it watches, for cheering at goals. */
  tv?: 'football' | 'game'
  taken: string | null
}

type Summon = {
  rune: ReturnType<typeof runeCircle>
  pillar: ReturnType<typeof lightPillar>
  points: THREE.Points
  velocities: THREE.Vector3[]
}

type PersonActor = {
  data: SimPerson
  fig: Figure
  label: CSS2DObject
  chip: HTMLElement
  bubble: HTMLElement
  bubbleUntil: number
  /** The speech bubble with Claude's words, which line it shows and until when. */
  speech: HTMLElement
  saidAt: number
  speechUntil: number
  born: number
  dying: number | null
  summon: Summon | null
  pos: THREE.Vector3
  face: number
  /** Their place at the desks. */
  desk: { pos: THREE.Vector3; face: number; seated: boolean }
  /** At the desk, walking somewhere, or taking it easy in the common room. */
  mode: 'desk' | 'walk' | 'leisure'
  dest: 'desk' | 'leisure'
  path: THREE.Vector3[]
  /** Points passed on the current walk, to turn back the way they came. */
  trail: THREE.Vector3[]
  spot: Spot | null
  /** When the session last went idle or done: they wander off a moment later. */
  calmSince: number
  /** When they get bored of their spot in the common room and go and do something else. */
  restless: number
  /** When they started saying goodbye before their session closes, and whether it has been closed. */
  leaving: number | null
  gone: boolean
  stride: number
  pad: THREE.Object3D | null
  cue: THREE.Object3D | null
  book: THREE.Object3D | null
  /** A reaction to a command finishing: cheering at passing tests, smoke at a failure, until `until`. */
  react: { ok: boolean; test: boolean; until: number } | null
  reactedAt: number
  phase: number
  /** What the label shows now, so the DOM is only touched when it changes. */
  shown: { talk: boolean; bubble: boolean; wait: boolean }
}

/** A screen painted many times a second; `face` is skipped while it is out of view. */
type Telly = { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; face: THREE.Mesh; next: number }

/** The Canopy Core: server racks, a reactor and a dashboard that show how Canopy itself is doing. */
type Core = {
  group: THREE.Group
  leds: THREE.InstancedMesh
  ledAt: number
  heart: THREE.Mesh
  heartMat: THREE.MeshStandardMaterial
  rings: THREE.Object3D[]
  board: ReturnType<typeof bigScreen>
  boardKey: string
  boardAt: number
  /** Smoothed readings, so the reactor eases between samples. */
  cpu: number
  mem: number
  smokeAt: number
}

type BandPart = 'guitar' | 'bass' | 'drums' | 'vocals'

/** The band on the stage, its lights and the dance floor in front of it. */
type Band = {
  members: { fig: Figure; part: BandPart; phase: number }[]
  beams: THREE.MeshBasicMaterial[]
  cans: THREE.Group[]
  strip: THREE.MeshStandardMaterial
  cymbals: THREE.Object3D[]
  light: THREE.PointLight
  wall: Telly
  floor: Telly
}

const easeOutBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const v3 = (x: number, z: number) => new THREE.Vector3(x, 0, z)
const calm = (s: Status) => s === 'idle' || s === 'done'

/** Seats as a team fills a pod: across the planter, then along it. */
function seatOrder(seats: Seat[]) {
  const half = seats.length / 2
  return Array.from({ length: seats.length }, (_, i) => seats[(i % 2) * half + Math.floor(i / 2)]!)
}

export class WorkspaceScene {
  private readonly opts: SceneOptions
  private readonly renderer: THREE.WebGLRenderer
  private readonly labels: CSS2DRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly clock = new THREE.Clock()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly resize: ResizeObserver
  private frame = 0

  private floor = new THREE.Group()
  private built: THREE.Object3D[] = []
  private structure = ''
  private rooms = new Map<string, RoomActor>()
  private people = new Map<string, PersonActor>()
  private sign: ReturnType<typeof floorText> | null = null
  private signKey = ''
  private bounds = { w: 20, d: 20, cz: 0 }
  /** The office with GitHub HQ and the AWS data centre either side, for the camera, the sun and the weather. */
  private world = { cx: 0, w: 20, d: 20, cz: 0 }
  private hq: GithubHQ | null = null
  private hqData: HqData = { repos: [], pulls: [], runs: [], loading: true }
  private dc: AwsDataCentre | null = null
  private dcData: DcData = { profile: '', region: '', instances: [], envs: [], loading: true }
  /** x of the side aisles that lead from the back rows down to the common room. */
  private aisleX = 10
  private spots: Spot[] = []
  private football: (Telly & { goals: [number, number]; goalUntil: number; nextGoal: number }) | null = null
  private game: Telly | null = null
  private arcadeGlow: THREE.MeshStandardMaterial | null = null
  private pong: { ball: THREE.Mesh; x: number; z: number } | null = null
  private hockey: { puck: THREE.Mesh; mallets: THREE.Object3D[] } | null = null
  /** The day the common room is laid out for, when to look at the calendar again, and how to lay it all out anew. */
  private day = 0
  private dayCheck = 0
  private rebuild: (() => void) | null = null
  private band: Band | null = null
  /** The person the camera keeps up with, and where they were last frame. */
  private follow: { id: string; last: THREE.Vector3 } | null = null
  private firstSync = true
  private hovered: Pick | null = null
  private down: { x: number; y: number } | null = null
  /** A camera flight; with `offset` it is to a person, tracking them as they move. */
  private fly: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; start: number; offset?: THREE.Vector3 } | null = null
  /** The real lights lent out to the places nearest the camera, and the places that can have one. */
  private slots: LightSlot[] = []
  private glows: Glow[] = []
  private glowAt = 0
  private core: Core | null = null
  private metrics: SimMetrics | null = null
  /** Drawing at all (false under something that hides the view), and at full rate until when. */
  private active = true
  private dragging = false
  private busyUntil = 0
  private shadowAt = 0
  private labelsAt = 0
  private fps = { frames: 0, from: 0 }
  /** The pointer's latest spot over the view, picked under once on the next frame. */
  private hoverAt: { x: number; y: number } | null = null
  private hoverShown: { x: number; y: number } | null = null
  private readonly frustum = new THREE.Frustum()
  private readonly viewProj = new THREE.Matrix4()
  private readonly step = new THREE.Vector3()
  private fog: THREE.Fog | null = null

  constructor(opts: SceneOptions) {
    this.opts = opts
    const { container } = opts

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // Drawn again a dozen times a second by the loop, not every frame.
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.labels = new CSS2DRenderer()
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
    container.appendChild(this.labels.domElement)

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.5, 2000)
    this.camera.position.set(30, 40, 50)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = 1.25
    this.controls.minDistance = 5
    this.controls.maxDistance = 260
    // Drag the floor like a map: the left button pans, the right button turns, the wheel zooms.
    this.controls.screenSpacePanning = false
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    this.controls.panSpeed = 1.2
    // Full frame rate while the camera is being moved, and a moment after while it settles.
    this.controls.addEventListener('start', this.onControlStart)
    this.controls.addEventListener('end', this.onControlEnd)

    // Early evening: a soft sky and a low warm sun, so the rooms with their lights on stand out.
    this.hemi = new THREE.HemisphereLight('#d6d0ff', '#4b3f38', 0.5)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight('#ffd9b0', 0.75)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0003
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun, this.sun.target)
    this.scene.add(this.floor)
    this.scene.background = BACKGROUND.clone()
    for (let i = 0; i < LIGHT_SLOTS; i++) {
      const light = new THREE.PointLight('#ffd9a0', 0, 0, 2)
      this.scene.add(light)
      this.slots.push({ light, glow: null, k: 0 })
    }

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)

    this.resize = new ResizeObserver(() => this.fit())
    this.resize.observe(container)
    this.fit()
    this.loop()
  }

  // ------------------------------------------------------------ public

  sync(rooms: SimRoom[], people: SimPerson[]) {
    const counts = new Map<string, number>()
    for (const p of people) if (!p.parentId) counts.set(p.roomId, (counts.get(p.roomId) || 0) + 1)
    const perSide = (id: string) => Math.min(6, Math.max(2, Math.ceil((counts.get(id) || 0) / 2)))
    const signature = JSON.stringify(rooms.map(r => [r.id, r.name, r.hue, perSide(r.id)]))
    if (signature !== this.structure) {
      this.structure = signature
      this.rebuild = () => this.build(rooms, perSide)
      this.rebuild()
    }

    const t = this.clock.elapsedTime
    for (const r of rooms) {
      const room = this.rooms.get(r.id)
      if (!room) continue
      room.data = r
      const on = (counts.get(r.id) || 0) > 0
      if (on !== room.on) {
        room.on = on
        room.switchedAt = this.firstSync ? -10 : t
        if (this.firstSync) room.lit = on ? 1 : 0
      }
      this.paintRoom(room)
    }
    this.paintSign(rooms, people)
    this.syncPeople(people)

    if (this.firstSync) {
      this.firstSync = false
      this.resetView(false)
    }
  }

  /** The repos, PRs and runs GitHub HQ shows. */
  syncGithub(d: HqData) {
    this.hqData = d
    this.hq?.sync(d)
  }

  /** Canopy's own numbers, for the Canopy Core; null before the first sample. */
  setMetrics(m: SimMetrics | null) {
    this.metrics = m
  }

  /** Stops drawing while something solid covers the view, and starts again after. */
  setActive(on: boolean) {
    if (on === this.active) return
    this.active = on
    this.drawnAt = 0
    if (on) this.renderer.shadowMap.needsUpdate = true
  }

  /** The EC2 instances and Beanstalk environments the AWS data centre shows. */
  syncAws(d: DcData) {
    this.dcData = d
    this.dc?.sync(d)
  }

  /** Fly back out to see the whole workspace. */
  resetView(animate = true) {
    this.follow = null
    // Wide enough for the office and the buildings either side, in a narrower view too.
    const size = Math.max(this.world.w * Math.max(1, 1.55 / Math.max(0.5, this.camera.aspect)), this.world.d)
    // A little towards the common room, which is where most of the fun is.
    const target = v3(this.world.cx, this.bounds.cz + 1)
    const pos = new THREE.Vector3(target.x + size * 0.04, size * 0.58 + 6, target.z + size * 0.74 + 8)
    if (animate) this.flyTo(pos, target)
    else {
      this.camera.position.copy(pos)
      this.controls.target.copy(target)
      this.controls.update()
    }
  }

  /** Fly the camera to a room, or to a person and keep up with them as they walk about. */
  focus(pick: Pick) {
    this.follow = null
    if (pick.kind === 'person') {
      const p = this.people.get(pick.id)
      if (!p) return
      const offset = new THREE.Vector3(4, 7, 8)
      this.flyTo(p.pos.clone().add(offset), p.pos.clone())
      this.fly!.offset = offset
      this.follow = { id: pick.id, last: p.pos.clone() }
      return
    }
    if (pick.kind === 'gh') {
      const p = this.hq?.where(pick.id)
      if (!p) return
      // The whole building, a wing, or up close to one thing in it.
      const away = pick.id === 'hq' ? new THREE.Vector3(0, 22, 26) : pick.id.startsWith('wing:') ? new THREE.Vector3(0, 11, 12) : new THREE.Vector3(2.5, 4.5, 6)
      this.flyTo(p.clone().add(away), p)
      return
    }
    if (pick.kind === 'core') {
      const c = this.core?.group.position
      if (c) this.flyTo(c.clone().add(new THREE.Vector3(1.5, 4.5, 7.5)), c.clone().setY(1.6))
      return
    }
    if (pick.kind === 'aws') {
      const p = this.dc?.where(pick.id)
      if (!p) return
      const away = pick.id === 'dc' ? new THREE.Vector3(0, 22, 26) : pick.id.startsWith('wing:') ? new THREE.Vector3(0, 11, 12) : new THREE.Vector3(2.5, 4.5, 6)
      this.flyTo(p.clone().add(away), p)
      return
    }
    const room = this.rooms.get(pick.id)
    if (!room) return
    const c = room.center
    this.flyTo(c.clone().add(new THREE.Vector3(0, 10 + room.width * 0.4, 9 + room.width * 0.45)), c.clone().add(new THREE.Vector3(0, 0, -0.6)))
  }

  /**
   * The local hour, today's sunrise and sunset, and the weather: the light follows the day from a
   * dark night through dusk to bright day, and rain, snow, fog or a storm falls over the floor.
   */
  setSky(o: { hour: number; sunrise: number; sunset: number; sky: Sky | null }) {
    const changed = o.sky !== this.sky.sky
    this.sky = o
    this.applySky()
    if (changed) this.makeWeather()
  }

  private sky: { hour: number; sunrise: number; sunset: number; sky: Sky | null } = { hour: 18.5, sunrise: 6, sunset: 18, sky: null }
  private weather: { kind: Sky; obj: THREE.LineSegments | THREE.Points; drift: Float32Array } | null = null
  private flash = { next: 0, until: 0 }
  private hemiBase = 0.5

  /** How light it is: 0 at night, 0.5 at sunrise and sunset, 1 in the day, an hour's twilight either side. */
  private daylight() {
    const { hour: h, sunrise, sunset } = this.sky
    const ramp = (x: number) => clamp01((x + 1) / 2)
    return Math.min(ramp(h - sunrise), ramp(sunset - h))
  }

  private applySky() {
    const d = this.daylight()
    const [a, b, k] = d < 0.5 ? [LIGHT.night, LIGHT.dusk, d * 2] : [LIGHT.dusk, LIGHT.day, (d - 0.5) * 2]
    const dim = this.sky.sky ? OVERCAST[this.sky.sky] : 1
    const bg = (this.scene.background as THREE.Color | null) instanceof THREE.Color ? this.scene.background as THREE.Color : new THREE.Color()
    bg.copy(a.bg).lerp(b.bg, k).multiplyScalar(0.55 + 0.45 * dim)
    this.scene.background = bg
    this.hemi.color.copy(a.hemi).lerp(b.hemi, k)
    this.hemiBase = (a.hemiI + (b.hemiI - a.hemiI) * k) * (0.75 + 0.25 * dim)
    this.hemi.intensity = this.hemiBase
    this.sun.color.copy(a.sun).lerp(b.sun, k)
    this.sun.intensity = (a.sunI + (b.sunI - a.sunI) * k) * dim
    // The sun crosses the sky through the day; at night the moon sits high in the east.
    const { cx, cz } = this.world
    const s = Math.max(this.world.w, this.world.d)
    const { hour, sunrise, sunset } = this.sky
    const p = clamp01((hour - sunrise) / Math.max(1, sunset - sunrise))
    const up = d > 0 ? Math.max(0.3, Math.sin(Math.PI * p)) : 0.9
    const across = d > 0 ? Math.cos(Math.PI * p) : 0.4
    this.sun.position.set(cx + across * s * 0.8, s * (0.3 + 0.7 * up), cz + s * 0.55)
    this.sun.target.position.set(cx, 0, cz)
    if (this.sky.sky === 'fog') {
      this.fog ??= new THREE.Fog(bg.clone())
      this.fog.color.copy(bg)
      this.fog.near = s * 0.5
      this.fog.far = s * 1.9
      this.scene.fog = this.fog
    } else {
      this.scene.fog = null
    }
    this.renderer.shadowMap.needsUpdate = true
  }

  /** Rain as falling streaks, snow as drifting flakes, over the whole floor. */
  private makeWeather() {
    if (this.weather) {
      this.scene.remove(this.weather.obj)
      this.weather.obj.geometry.dispose()
      ;(this.weather.obj.material as THREE.Material).dispose()
      this.weather = null
    }
    const kind = this.sky.sky
    if (kind !== 'rain' && kind !== 'storm' && kind !== 'snow') return
    const { cx, w, d, cz } = this.world
    const n = Math.round(Math.min(3200, Math.max(500, w * d * (kind === 'snow' ? 0.5 : 0.9))))
    const drift = new Float32Array(n)
    const rand = () => [cx + (Math.random() - 0.5) * w, Math.random() * 14, cz + (Math.random() - 0.5) * d] as const
    if (kind === 'snow') {
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        pos.set(rand(), i * 3)
        drift[i] = Math.random() * Math.PI * 2
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const obj = new THREE.Points(g, new THREE.PointsMaterial({ map: spark(), color: '#ffffff', size: 0.32, transparent: true, depthWrite: false, opacity: 0.95 }))
      this.scene.add(obj)
      this.weather = { kind, obj, drift }
      return
    }
    const pos = new Float32Array(n * 6)
    for (let i = 0; i < n; i++) {
      const [x, y, z] = rand()
      pos.set([x, y, z, x + 0.04, y + 0.45, z], i * 6)
      drift[i] = 0.8 + Math.random() * 0.4
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b9cdf5', transparent: true, opacity: 0.4, depthWrite: false }))
    obj.frustumCulled = false
    this.scene.add(obj)
    this.weather = { kind, obj, drift }
  }

  private stepWeather(t: number, dt: number) {
    const wx = this.weather
    if (wx) {
      const pos = wx.obj.geometry.getAttribute('position') as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      if (wx.kind === 'snow') {
        for (let i = 0; i < wx.drift.length; i++) {
          const j = i * 3
          arr[j]! += Math.sin(t * 0.8 + wx.drift[i]!) * 0.3 * dt
          arr[j + 1]! -= 1.1 * dt
          if (arr[j + 1]! < 0) arr[j + 1]! += 14
        }
      } else {
        for (let i = 0; i < wx.drift.length; i++) {
          const j = i * 6
          const fall = 16 * wx.drift[i]! * dt
          arr[j + 1]! -= fall
          arr[j + 4]! -= fall
          if (arr[j + 1]! < 0) {
            arr[j + 1]! += 14
            arr[j + 4]! += 14
          }
        }
      }
      pos.needsUpdate = true
    }
    // Lightning in a storm: a double flash every so often.
    if (this.sky.sky !== 'storm') return
    if (t > this.flash.next) {
      this.flash.until = t + 0.35
      this.flash.next = t + 7 + Math.random() * 10
    }
    const on = t < this.flash.until && (this.flash.until - t > 0.25 || this.flash.until - t < 0.12)
    this.hemi.intensity = on ? 2.2 : this.hemiBase
  }

  /**
   * Someone stops what they are doing, turns to the camera and waves goodbye; `onFarewell` fires
   * when they are done, and they vanish once their session is gone.
   */
  farewell(id: string) {
    const a = this.people.get(id)
    if (!a || a.dying !== null || a.leaving !== null) return
    a.leaving = this.clock.elapsedTime
    a.path = []
    a.speechUntil = 0
    this.say(a, 'Goodbye! 👋', 4)
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.resize.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    for (const p of [...this.people.values()]) this.removePerson(p)
    this.sky.sky = null
    this.makeWeather()
    for (const p of this.puffs) {
      this.scene.remove(p.points)
      p.points.geometry.dispose()
      ;(p.points.material as THREE.Material).dispose()
    }
    this.clearBuilt()
    this.controls.removeEventListener('start', this.onControlStart)
    this.controls.removeEventListener('end', this.onControlEnd)
    this.controls.dispose()
    this.renderer.dispose()
    // Hands the GL context back now, rather than whenever the canvas is collected.
    this.renderer.forceContextLoss()
    disposeKit()
    this.opts.onFps?.(0)
    canvas.remove()
    this.labels.domElement.remove()
  }

  // ------------------------------------------------------------ building

  private clearBuilt() {
    this.hq?.dispose()
    this.hq = null
    this.dc?.dispose()
    this.dc = null
    for (const o of this.built) {
      this.floor.remove(o)
      disposeTree(o)
    }
    this.built = []
    this.rooms.clear()
    this.sign = null
    this.signKey = ''
    this.football = null
    this.game = null
    this.arcadeGlow = null
    this.pong = null
    this.hockey = null
    this.band = null
    this.core = null
    this.glows = []
    for (const s of this.slots) {
      s.glow = null
      s.k = 0
      s.light.intensity = 0
    }
  }

  private add(o: THREE.Object3D) {
    this.floor.add(o)
    this.built.push(o)
    return o
  }

  private build(rooms: SimRoom[], perSide: (id: string) => number) {
    const previous = new Map([...this.rooms].map(([id, r]) => [id, { lit: r.lit, on: r.on }]))
    // Whoever is out in the common room gives their spot back; the new room plans new ones.
    const out = [...this.people.values()].filter(p => p.spot)
    this.clearBuilt()

    // Rows of up to four rooms, row 0 opening onto the common room and the rest behind it.
    const widthOf = (id: string) => Math.max(10, perSide(id) * 1.5 + 4.6)
    const cols = rooms.length <= 3 ? Math.max(1, rooms.length) : Math.min(4, Math.ceil(Math.sqrt(rooms.length * 1.4)))
    const rows: SimRoom[][] = []
    rooms.forEach((r, i) => (rows[Math.floor(i / cols)] ||= []).push(r))
    const rowWidth = (row: SimRoom[]) => row.reduce((a, r) => a + widthOf(r.id), 0) + HALL * (row.length - 1)
    const maxW = Math.max(10, ...rows.map(rowWidth))
    const commonW = Math.max(maxW, 30)
    this.aisleX = maxW / 2 + 1.6
    const back = -Math.max(1, rows.length) * (ROOM_D + HALL) + HALL - 1
    const front = HALL + COMMON_D + STAGE_D + 1
    this.bounds = { w: Math.max(maxW, commonW) + 8, d: front - back + 2, cz: (front + back) / 2 }

    // GitHub HQ stands on its own ground to the right of the office, level with the common room,
    // and the AWS data centre likewise to the left.
    const hqX = this.bounds.w / 2 + HQ_GAP + HQ_SIZE.w / 2
    const hqZ = HALL + COMMON_D / 2 - HQ_SIZE.cz
    const dcX = -this.bounds.w / 2 - HQ_GAP - DC_SIZE.w / 2
    const dcZ = HALL + COMMON_D / 2 - DC_SIZE.cz
    const left = dcX - DC_SIZE.w / 2, right = hqX + HQ_SIZE.w / 2
    const near = Math.min(this.bounds.cz - this.bounds.d / 2, hqZ + HQ_SIZE.cz - HQ_SIZE.d / 2, dcZ + DC_SIZE.cz - DC_SIZE.d / 2)
    const far = Math.max(this.bounds.cz + this.bounds.d / 2, hqZ + HQ_SIZE.cz + HQ_SIZE.d / 2, dcZ + DC_SIZE.cz + DC_SIZE.d / 2)
    this.world = { cx: (left + right) / 2, w: right - left, d: far - near, cz: (near + far) / 2 }

    const ground = this.add(blueprintGround(Math.max(this.world.w, this.world.d) * 3))
    ground.position.set(this.world.cx, ground.position.y, this.world.cz)
    const wood = this.add(woodFloor(this.bounds.w, this.bounds.d))
    wood.position.z = this.bounds.cz

    rows.forEach((row, ri) => {
      let x = -rowWidth(row) / 2
      for (const r of row) {
        const w = widthOf(r.id)
        const center = v3(x + w / 2, -ri * (ROOM_D + HALL) - ROOM_D / 2)
        const room = this.buildRoom(r, center, w, perSide(r.id), ri)
        const prev = previous.get(r.id)
        if (prev) {
          room.lit = prev.lit
          room.on = prev.on
        }
        this.rooms.set(r.id, room)
        x += w + HALL
      }
    })
    this.buildCommon(commonW)
    this.buildStage()
    this.buildCore(commonW)

    const hq = new GithubHQ()
    hq.group.position.set(hqX, 0, hqZ)
    this.add(hq.group)
    hq.sync(this.hqData)
    this.hq = hq
    for (const g of hq.glows) this.glows.push({ at: hq.group.position.clone().add(g.at), color: '#e6edf3', strength: 26, level: () => 1, real: 0, pool: g.pool })
    // A path across to it from the office floor, onto its plaza.
    const pathLen = HQ_GAP + 0.4
    const path = this.add(mesh(boxGeo(pathLen, 0.06, 2.6), mat('#3a3f4b', { roughness: 0.95 }), false))
    path.position.set(this.bounds.w / 2 + pathLen / 2 - 0.2, -0.02, hqZ + HQ_PATH_Z)
    for (const o of [ground, wood, path]) freeze(o)

    const dc = new AwsDataCentre()
    dc.group.position.set(dcX, 0, dcZ)
    this.add(dc.group)
    dc.sync(this.dcData)
    this.dc = dc
    const dcPath = this.add(mesh(boxGeo(pathLen, 0.06, 2.6), mat('#3a3f4b', { roughness: 0.95 }), false))
    dcPath.position.set(-this.bounds.w / 2 - pathLen / 2 + 0.2, -0.02, dcZ + DC_PATH_Z)

    for (const p of out) {
      p.spot = null
      if (p.mode === 'leisure' || (p.mode === 'walk' && p.dest === 'leisure')) this.goLeisure(p, true)
    }

    const s = Math.max(this.world.w, this.world.d)
    this.applySky()
    this.makeWeather()
    const cam = this.sun.shadow.camera
    cam.left = cam.bottom = -s * 0.75
    cam.right = cam.top = s * 0.75
    cam.near = 1
    cam.far = s * 3
    cam.updateProjectionMatrix()
    // No compileAsync to warm the shaders: it polls on a timer and throws there when GitHub HQ swaps
    // out materials in the meantime. A fixed light count already keeps them from recompiling.
    this.renderer.shadowMap.needsUpdate = true
  }

  private buildRoom(data: SimRoom, center: THREE.Vector3, w: number, perSide: number, row: number): RoomActor {
    const g = new THREE.Group()
    g.position.copy(center)
    const color = '#' + oklch(0.72, 0.12, data.hue).getHexString()
    const seed = hashOf(data.id)
    const d = ROOM_D
    const v = (x: number, z: number) => new THREE.Vector2(x, z)

    const rug = carpet(w - 0.4, d - 0.4, tint(color, 0.25))
    g.add(rug)
    tag(rug, { kind: 'room', id: data.id })

    // Low walls in the room's colour, open at the front for the door under its arch.
    const wall = tint(color, 0.35)
    g.add(lowWall(v(-w / 2, -d / 2), v(w / 2, -d / 2), wall))
    g.add(lowWall(v(-w / 2, -d / 2), v(-w / 2, d / 2), wall))
    g.add(lowWall(v(w / 2, -d / 2), v(w / 2, d / 2), wall))
    g.add(lowWall(v(-w / 2, d / 2), v(-1.1, d / 2), wall))
    g.add(lowWall(v(1.1, d / 2), v(w / 2, d / 2), wall))
    const arch = doorArch(data.name, color)
    arch.position.z = d / 2
    g.add(arch)

    // The room's own lamp and monitor materials, so they go dark with its lights.
    const lamp = new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffcf86', emissiveIntensity: 0, side: THREE.DoubleSide })
    const monitors = new THREE.MeshStandardMaterial({ color: '#2a3550', emissive: '#8fc8ff', emissiveIntensity: 0.05, roughness: 0.3 })
    const pod = deskPod(perSide, monitors, seed)
    pod.group.position.z = POD_Z
    g.add(pod.group)
    const pool = lightPool(pod.width + 4, 6.5)
    pool.mesh.position.z = POD_Z
    g.add(pool.mesh)

    const screen = bigScreen(3.4, 1.4, 0.85)
    screen.group.position.set(0, 0.85, -d / 2 + 0.55)
    g.add(screen.group)
    tag(screen.group, { kind: 'screen', id: data.id })

    // A lamp and a plant in the back corners, and a bean bag for thinking in.
    const fl = floorLamp(lamp)
    fl.position.set(-w / 2 + 0.6, 0, -d / 2 + 0.6)
    g.add(fl)
    const pl = plant(seed, 0.9)
    pl.position.set(w / 2 - 0.7, 0, -d / 2 + 0.7)
    g.add(pl)
    const bag = beanBag(['#f2c94c', '#ef8bb8', '#8fd6ff', '#b6f28c'][seed % 4]!)
    bag.position.set(w / 2 - 0.8, 0, -d / 2 + 1.9)
    g.add(bag)

    // The project's name on the hall floor in front of the door.
    const floor = floorText(w - 1, 1.5, 'center')
    floor.plane.position.set(center.x, 0.03, center.z + d / 2 + 1.6)
    this.add(floor.plane)

    this.add(g)
    freeze(g)
    freeze(floor.plane)
    const seats = seatOrder(pod.seats).map(s => ({ x: center.x + s.x, z: center.z + POD_Z + s.z, face: s.face }))
    const room: RoomActor = {
      data, center, width: w, row, podHalf: pod.width / 2, seats, color, ink: '#' + oklch(0.45, 0.13, data.hue).getHexString(),
      lit: 0, on: false, switchedAt: -10, glow: null!, lamp, monitors, pool: pool.material, screen, screenKey: '', floor,
    }
    room.glow = { at: center.clone().add(new THREE.Vector3(0, 3.6, POD_Z)), color: '#ffd9a0', strength: 28, level: () => room.lit, real: 0 }
    this.glows.push(room.glow)
    return room
  }

  /**
   * The common room in front of the rooms: football on the big TV and sofas to watch it from on the
   * left, two tables in the middle (ping pong, foosball, pool, air hockey or a board game), the games
   * corner on the right, a coffee bar and the arcade machine or darts at the front, and string lights
   * over it all. The tables and the front game change every day.
   */
  private buildCommon(width: number) {
    const x0 = -width / 2, x1 = width / 2
    const zc = HALL + COMMON_D / 2
    const zf = HALL + COMMON_D - 0.8
    const g = new THREE.Group()
    const spots: Spot[] = []
    const spot = (kind: SpotKind, x: number, z: number, face: number, lane: number, sit: number | null = null, tv?: Spot['tv']) =>
      spots.push({ kind, x, z, face, lane, sit, tv, taken: null })
    const at = <T extends THREE.Object3D>(o: T, x: number, z: number, ry = 0) => {
      o.position.set(x, o.position.y, z)
      o.rotation.y = ry
      g.add(o)
      return o
    }

    // Football: the TV faces +x, the sofas and bean bags face it.
    at(carpet(7, 6, '#7fb37a'), x0 + 3.6, zc)
    const tv = bigScreen(3.6, 2, 0.9, 512)
    tv.group.position.y = 0.9
    at(tv.group, x0 + 0.7, zc, Math.PI / 2)
    this.football = { canvas: tv.canvas, texture: tv.texture, face: tv.face, next: 0, goals: [0, 0], goalUntil: 0, nextGoal: 20 }
    for (const dz of [-1.15, 1.15]) {
      at(sofa(dz < 0 ? '#e0739a' : '#5a6bd6'), x0 + 3.6, zc + dz, -Math.PI / 2)
      for (const s of [-0.45, 0.45]) spot('sofa', x0 + 3.5, zc + dz + s, -Math.PI / 2, x0 + 2.4, 0.08, 'football')
    }
    for (const dz of [-0.9, 0.9]) {
      at(beanBag(dz < 0 ? '#f2c94c' : '#ef8bb8'), x0 + 5.6, zc + dz)
      spot('bean', x0 + 5.6, zc + dz, -Math.PI / 2, x0 + 6.6, -0.02, 'football')
    }

    // Two tables in the middle, a different pair every day.
    this.day = this.today()
    const lineup = lineupFor(this.day)
    const tables: Record<Table, (x: number, z: number) => void> = {
      pong: (x, z) => {
        at(pingPong(), x, z)
        spot('pong', x - 2.1, z, Math.PI / 2, x - 2.1)
        spot('pong', x + 2.1, z, -Math.PI / 2, x + 2.1)
        const ball = mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 }), false)
        ball.visible = false
        g.add(ball)
        this.pong = { ball, x, z }
      },
      foos: (x, z) => {
        at(foosball(), x, z)
        spot('foos', x, z - 0.75, 0, x)
        spot('foos', x, z + 0.75, Math.PI, x + 1.4)
      },
      pool: (x, z) => {
        at(poolTable(), x, z)
        spot('pool', x - 1.6, z, Math.PI / 2, x - 1.6)
        spot('pool', x + 1.6, z + 0.25, -Math.PI / 2, x + 1.6)
      },
      hockey: (x, z) => {
        const h = airHockey()
        at(h.group, x, z)
        spot('hockey', x - 1.3, z, Math.PI / 2, x - 1.3)
        spot('hockey', x + 1.3, z, -Math.PI / 2, x + 1.3)
        this.hockey = { puck: h.puck, mallets: h.mallets }
      },
      board: (x, z) => {
        at(boardGame(), x, z)
        spot('board', x, z - 0.95, 0, x, 0.1)
        spot('board', x - 0.95, z, Math.PI / 2, x - 0.95, 0.1)
        spot('board', x + 0.95, z, -Math.PI / 2, x + 0.95, 0.1)
        spot('board', x, z + 0.95, Math.PI, x + 1.6, 0.1)
      },
    }
    tables[lineup.tables[0]](-3.4, zc - 0.6)
    tables[lineup.tables[1]](3.4, zc - 0.6)

    // The games corner: the TV faces -x over the console, three bean bags face it.
    at(carpet(6, 6, '#8c7ad6'), x1 - 3, zc)
    const play = bigScreen(3.2, 1.8, 0.9, 512)
    play.group.position.y = 0.9
    at(play.group, x1 - 0.5, zc, -Math.PI / 2)
    this.game = { canvas: play.canvas, texture: play.texture, face: play.face, next: 0 }
    at(consoleBench(), x1 - 1.3, zc, -Math.PI / 2)
    ;[-1.3, 0, 1.3].forEach((dz, i) => {
      at(beanBag(['#4cc38a', '#e85f5c', '#5b9cff'][i]!), x1 - 3.9, zc + dz)
      spot(i < 2 ? 'game' : 'bean', x1 - 3.9, zc + dz, Math.PI / 2, x1 - 2.8, -0.02, 'game')
    })

    // The coffee bar and the day's game (the arcade machine or darts) along the front, facing back into the room.
    at(coffeeBar(), x0 + 3, zf, Math.PI)
    spot('coffee', x0 + 2.4, zf - 1.05, 0, x0 + 2.2)
    spot('coffee', x0 + 3.7, zf - 1.05, 0, x0 + 2.2)
    if (lineup.corner === 'arcade') {
      this.arcadeGlow = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ff4fd8', emissiveIntensity: 1.4 })
      at(arcade(this.arcadeGlow), x1 - 3, zf, Math.PI)
      spot('arcade', x1 - 3, zf - 0.95, 0, x1 - 2.8)
    } else {
      at(dartboard(2.3), x1 - 3, zf, Math.PI)
      spot('darts', x1 - 3.2, zf - 2.4, 0, x1 - 3.2)
      spot('darts', x1 - 2.1, zf - 2.75, -0.3, x1 - 2.1)
    }

    // A spot to stand around and chat, in a ring.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const x = Math.cos(a) * 1.3, z = zc + 1.6 + Math.sin(a) * 1.1
      spot('chat', x, z, Math.atan2(-x, zc + 1.6 - z), x)
    }

    for (const [x, z] of [[x0 + 0.8, HALL + 0.8], [x1 - 0.8, HALL + 0.8], [-8, zf], [8, zf]] as const) at(plant(Math.round(x * 7), 1.2), x, z)
    g.add(stringLights([new THREE.Vector2(x0 + 0.3, HALL + 0.3), new THREE.Vector2(x1 - 0.3, HALL + 0.3), new THREE.Vector2(x1 - 0.3, HALL + COMMON_D - 0.3), new THREE.Vector2(x0 + 0.3, HALL + COMMON_D - 0.3)]))
    // Two lights between the string lights, a little brighter than the three it used to take.
    for (const x of [-width * 0.22, width * 0.22]) {
      const l = new THREE.PointLight('#ffd6a8', 30, 0, 2)
      l.position.set(x, 4.4, zc)
      g.add(l)
    }

    const sign = floorText(14, 3, 'center')
    sign.plane.position.set(0, 0.03, zc + 4.4)
    g.add(sign.plane)
    this.sign = sign
    this.spots = spots
    this.add(g)
    // Only the ping pong ball and the air hockey puck and mallets move.
    freeze(g, [this.pong?.ball, this.hockey?.puck, ...this.hockey?.mallets ?? []].filter(o => !!o) as THREE.Object3D[])
  }

  /**
   * The stage in front of the common room, facing out the way the camera looks in: the band
   * (guitar, bass, drums and a singer), amps and a PA, a lighting truss and an LED wall behind
   * them. The dance floor is in front, reached down the lanes either side of the stage.
   */
  private buildStage() {
    const z0 = HALL + COMMON_D
    const w = 11, d = 4
    const st = stage(w, d, STAGE_H)
    st.group.position.set(0, 0, z0 + 0.8 + d / 2)
    const on = (o: THREE.Object3D, x: number, z: number, y = STAGE_H) => {
      o.position.set(x, y, z)
      st.group.add(o)
      return o
    }

    const kit = drumKit()
    on(kit.group, 0, -0.7)
    const wall = bigScreen(6, 2.1, 1.2, 512)
    on(wall.group, 0, -1.75, STAGE_H + 1.2)
    for (const x of [-1, 1]) {
      on(speaker(0.9, 0.8, 1), x * 3.7, -1.2)
      on(speaker(1, 1.9, 3), x * (w / 2 + 0.6), 1.3, 0)
    }
    on(micStand(), 0, 1.35)

    const members: Band['members'] = []
    const player = (part: BandPart, seed: number, role: Role, x: number, z: number) => {
      const fig = figure({ seed, role })
      on(fig.group, x, z)
      if (part === 'guitar' || part === 'bass') {
        const axe = guitar(part === 'bass' ? '#2f3443' : '#e85f5c', part === 'bass')
        axe.position.set(-0.05, 0.6, 0.32)
        fig.rig.add(axe)
      }
      if (part === 'drums') for (const arm of fig.arms) arm.add(drumstick())
      members.push({ fig, part, phase: seed % 7 })
    }
    player('guitar', 1201, 'developer', -2.8, 0.3)
    player('bass', 3407, 'designer', 2.8, 0.3)
    player('drums', 5519, 'developer', 0, -1.25)
    player('vocals', 7703, 'designer', 0, 0.85)

    const light = new THREE.PointLight('#ff4fd8', 0, 0, 2)
    light.position.set(0, 3.4, 1.5)
    st.group.add(light)
    this.add(st.group)

    // The dance floor: a grid of tiles that light up to the beat.
    const df = bigScreen(10, 3.6, 0, 512)
    df.group.children[0]!.visible = false
    df.face.rotation.x = -Math.PI / 2
    df.face.position.set(0, 0.03, 0)
    df.group.position.set(0, 0, z0 + 7.4)
    this.add(df.group)

    // Room to rock out in two loose rows on the dance floor, facing the stage.
    for (const [row, z] of [[0, z0 + 6.4], [1, z0 + 7.9]] as const) {
      for (let i = 0; i < 7; i++) {
        const x = -3.9 + i * 1.3 + (row ? 0.65 : 0) + Math.sin(i * 7.1 + row) * 0.15
        this.spots.push({ kind: 'crowd', x, z, face: Math.PI, sit: null, lane: x < 0 ? -STAGE_LANE : STAGE_LANE, taken: null })
      }
    }

    this.band = {
      members, beams: st.beams, cans: st.cans, strip: st.strip, cymbals: [kit.hat, kit.crash], light,
      wall: { canvas: wall.canvas, texture: wall.texture, face: wall.face, next: 0 },
      floor: { canvas: df.canvas, texture: df.texture, face: df.face, next: -2 },
    }
    // The band, the lighting cans and the cymbals move; the rest of the stage does not.
    freeze(st.group, [...members.map(m => m.fig.group), ...st.cans, kit.hat, kit.crash])
    freeze(df.group)
  }

  /**
   * The Canopy Core, in the front corner by the stage: two server racks whose lights blink faster
   * the harder Canopy works its CPU, a reactor whose heart swells with the memory it holds, and a
   * dashboard over them with the last two minutes of memory, CPU, frame rate and main-thread lag.
   * When the main thread lags it runs hot: the heart flashes red and the racks smoke.
   */
  private buildCore(commonW: number) {
    const g = new THREE.Group()
    // Between the floor's edge and the lane past the stage, turned a little towards the dance floor.
    g.position.set(-commonW / 2 + 4.4, 0, HALL + COMMON_D + 4)
    g.rotation.y = 0.3

    const pad = rbox(5, 0.06, 3.2, mat('#24212d', { roughness: 0.9 }), 0, 0.03)
    pad.castShadow = false
    g.add(pad)

    // Two racks of servers, a grid of status lights down each front: one instanced mesh for them all.
    const RACK = 2.1, COLS = 3, ROWS = 11
    const shell = mat('#1d1b24', { roughness: 0.5, metalness: 0.3 })
    const blade = mat('#2c2a36', { roughness: 0.6, metalness: 0.2 })
    const ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    const leds = new THREE.InstancedMesh(boxGeo(0.1, 0.05, 0.02), ledMat, 2 * COLS * ROWS)
    const m = new THREE.Matrix4()
    let n = 0
    for (const side of [-1, 1]) {
      const x = side * 1.6
      const rack = rbox(0.9, RACK, 0.8, shell, 0.06, 0.05)
      rack.position.x = x
      g.add(rack)
      for (let r = 0; r < ROWS; r++) {
        const y = 0.3 + r * 0.17
        const b = mesh(boxGeo(0.78, 0.13, 0.02), blade, false)
        b.position.set(x, y, 0.41)
        g.add(b)
        for (let c = 0; c < COLS; c++) {
          m.makeTranslation(x + 0.12 + c * 0.12, y, 0.425)
          leds.setMatrixAt(n++, m)
        }
      }
    }
    for (let i = 0; i < n; i++) leds.setColorAt(i, LED.ok)
    leds.computeBoundingSphere()
    g.add(leds)

    // The reactor between them: a plinth, a glass tube with the glowing heart inside, rings round it.
    const metal = mat('#3a3d48', { roughness: 0.35, metalness: 0.6 })
    const plinth = mesh(geo('core-plinth', () => new THREE.CylinderGeometry(0.62, 0.7, 0.35, 24)), metal)
    plinth.position.y = 0.2
    g.add(plinth)
    const cap = mesh(geo('core-cap', () => new THREE.CylinderGeometry(0.5, 0.62, 0.22, 24)), metal)
    cap.position.y = 2.05
    g.add(cap)
    const glass = mesh(geo('core-glass', () => new THREE.CylinderGeometry(0.5, 0.5, 1.7, 24, 1, true)),
      mat('#bfe6ff', { transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false }), false)
    glass.position.y = 1.2
    g.add(glass)
    // Not tone mapped, so it stays a saturated green, amber or red rather than washing out to white.
    const heartMat = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#4cc38a', emissiveIntensity: 1.2, toneMapped: false })
    const heart = mesh(geo('core-heart', () => new THREE.IcosahedronGeometry(0.5, 2)), heartMat, false)
    heart.position.y = 1.2
    g.add(heart)
    const ringMat = mat('#8fd6ff', { emissive: '#8fd6ff', emissiveIntensity: 1.4 })
    const rings = [0, 1].map((i) => {
      const ring = mesh(geo('core-ring', () => new THREE.TorusGeometry(0.62, 0.03, 8, 40)), ringMat, false)
      ring.position.y = 1.2
      ring.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.5)
      g.add(ring)
      return ring
    })

    // The dashboard on two legs behind it all, above the racks.
    const board = bigScreen(3.6, 1.8, 2.3, 512)
    board.group.position.set(0, 2.3, -0.75)
    g.add(board.group)

    const sign = floorText(4.6, 0.7, 'center')
    sign.draw([{ text: 'CANOPY CORE', size: 0.42, color: 'rgba(143, 214, 255, .7)', weight: 800 }])
    sign.plane.position.set(0, 0.07, 1.25)
    g.add(sign.plane)

    tag(g, { kind: 'core', id: 'core' })
    this.add(g)
    freeze(g, [heart, ...rings])
    this.core = { group: g, leds, ledAt: 0, heart, heartMat, rings, board, boardKey: '', boardAt: 0, cpu: 0, mem: 0, smokeAt: 0 }
  }

  /** Runs the Canopy Core off the latest numbers. */
  private stepCore(t: number, dt: number) {
    const c = this.core
    if (!c) return
    const m = this.metrics
    const cpu = m?.cpu ?? 0, mem = m?.memMB ?? 0
    c.cpu += (cpu - c.cpu) * Math.min(1, dt * 2)
    c.mem += (mem - c.mem) * Math.min(1, dt * 2)
    const hot = coreHot(m)
    // CPU is a share of the whole machine: a third of it is a lot for an app.
    const busy = clamp01(c.cpu / 35)

    // The heart: bigger with more memory (full at 4 GB), beating, green to amber with CPU, red and flashing when hot.
    const size = 0.45 + 0.4 * clamp01(c.mem / 4096)
    c.heart.scale.setScalar(size * (1 + Math.sin(t * (3 + busy * 9)) * 0.05))
    c.heart.rotation.y += dt * (0.3 + busy * 2)
    if (hot) c.heartMat.emissive.set(Math.sin(t * 14) > 0 ? '#ff4d4f' : '#ff9f43')
    else c.heartMat.emissive.setHSL(0.38 - 0.27 * busy, 0.75, 0.55)
    c.heartMat.emissiveIntensity = hot ? 1.1 : 0.8 + busy * 0.3
    c.rings.forEach((r, i) => { r.rotation.z += dt * (0.4 + busy * 6) * (i ? -1 : 1) })

    // The racks' lights, a dozen times a second: each blinks at its own pace, quicker with more CPU.
    if (t >= c.ledAt && this.inView(c.leds)) {
      c.ledAt = t + 1 / 12
      const rate = 0.6 + busy * 14
      for (let i = 0; i < c.leds.count; i++) {
        const k = Math.floor(t * rate * (0.6 + (i % 7) * 0.1) + i)
        const h = (Math.imul(i + 1, 73856093) ^ Math.imul(k, 19349663)) >>> 0
        const p = (h >>> 8) % 100
        c.leds.setColorAt(i, p < 30 ? LED.off : hot && p > 80 ? LED.hot : p > 93 ? LED.warn : i % 11 === 0 ? LED.info : LED.ok)
      }
      c.leds.instanceColor!.needsUpdate = true
    }

    // Smoke off the racks while it runs hot.
    if (hot && t >= c.smokeAt) {
      c.smokeAt = t + 0.7
      const at = new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 1.6, RACK_TOP, 0)
      this.smoke(c.group.localToWorld(at))
    }

    // The dashboard, at most once a second and only when the numbers change.
    if (t >= c.boardAt && m) {
      const key = JSON.stringify([Math.round(m.memMB), Math.round(m.cpu * 10), m.fps, Math.round(m.lagMs), Math.round(m.lagMaxMs), m.history.length, m.history.at(-1)?.memMB])
      if (key !== c.boardKey) {
        c.boardAt = t + 1
        c.boardKey = key
        drawCore(c.board.canvas, m, hot)
        c.board.texture.needsUpdate = true
      }
    }
  }

  private paintRoom(room: RoomActor) {
    const s = room.data.stats
    const key = JSON.stringify([room.data.name, s])
    if (key === room.screenKey) return
    room.screenKey = key

    const people = s.sessions + s.subagents
    room.floor.draw([
      { text: room.data.name, size: 0.62, color: room.ink, weight: 800 },
      { text: people ? `${s.sessions} session${s.sessions === 1 ? '' : 's'}${s.subagents ? ` · ${s.subagents} subagent${s.subagents === 1 ? '' : 's'}` : ''}` : 'Lights off', size: 0.34, color: 'rgba(60, 44, 30, .75)', weight: 600 },
    ])

    const { canvas, texture } = room.screen
    const x = canvas.getContext('2d')!
    const W = canvas.width
    const bg = x.createLinearGradient(0, 0, W, canvas.height)
    bg.addColorStop(0, '#141826')
    bg.addColorStop(1, '#1f2538')
    x.fillStyle = bg
    x.fillRect(0, 0, W, canvas.height)
    x.fillStyle = room.color
    x.fillRect(0, 0, W, 10)
    x.textBaseline = 'top'
    x.textAlign = 'left'
    x.fillStyle = '#ffffff'
    x.font = `700 54px ${FONT}`
    x.fillText(room.data.name, 40, 36, W - 260)
    x.fillStyle = 'rgba(255,255,255,.55)'
    x.font = `500 28px ${FONT}`
    x.textAlign = 'right'
    x.fillText('Overview', W - 40, 50)
    x.textAlign = 'left'
    const tiles: [string, string, string][] = [
      [String(s.working), 'working', STATUS_COLOR.working],
      [String(s.waiting), 'waiting', STATUS_COLOR.waiting],
      [String(s.subagents), 'subagents', '#b48cff'],
      [s.today, 'spend', '#4cc38a'],
    ]
    const tw = (W - 80 - 3 * 24) / 4
    tiles.forEach(([n, label, c], i) => {
      const tx = 40 + i * (tw + 24), ty = 140
      x.fillStyle = 'rgba(255,255,255,.06)'
      x.beginPath()
      x.roundRect(tx, ty, tw, 210, 18)
      x.fill()
      x.fillStyle = c
      x.font = `700 ${n.length > 5 ? 60 : 84}px ${FONT}`
      x.fillText(n, tx + 24, ty + 28, tw - 40)
      x.fillStyle = 'rgba(255,255,255,.6)'
      x.font = `500 30px ${FONT}`
      x.fillText(label, tx + 24, ty + 150)
    })
    texture.needsUpdate = true
  }

  private paintSign(rooms: SimRoom[], people: SimPerson[]) {
    const sessions = people.filter(p => !p.parentId).length
    const lit = rooms.filter(r => people.some(p => p.roomId === r.id)).length
    const key = `${rooms.length}:${sessions}:${people.length - sessions}:${lit}`
    if (!this.sign || key === this.signKey) return
    this.signKey = key
    const sub = people.length - sessions
    this.sign.draw([
      { text: 'Canopy', size: 1.7, color: 'rgba(52, 38, 26, .82)', weight: 800 },
      { text: `${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${lit} lit · ${sessions} session${sessions === 1 ? '' : 's'}${sub ? ` · ${sub} subagent${sub === 1 ? '' : 's'}` : ''}`, size: 0.45, color: 'rgba(52, 38, 26, .6)', weight: 600 },
    ])
  }

  // ------------------------------------------------------------ people

  private syncPeople(list: SimPerson[]) {
    const t = this.clock.elapsedTime
    const seen = new Set<string>()
    const byRoom = new Map<string, SimPerson[]>()
    for (const p of list) if (!p.parentId) (byRoom.get(p.roomId) || byRoom.set(p.roomId, []).get(p.roomId)!).push(p)

    // Sessions sit at the room's desks in order; extras stand along the back of the room.
    const desks = new Map<string, PersonActor['desk']>()
    for (const [rid, ps] of byRoom) {
      const room = this.rooms.get(rid)
      if (!room) continue
      ps.forEach((p, i) => {
        const s = room.seats[i]
        if (s) desks.set(p.id, { pos: v3(s.x, s.z), face: s.face, seated: true })
        else desks.set(p.id, { pos: v3(room.center.x - room.width / 2 + 1.2 + (i - room.seats.length) * 1.1, room.center.z - ROOM_D / 2 + 2.6), face: 0, seated: false })
      })
    }
    // Subagents stand behind the chair of the session that started them, fanned out.
    const helpers = new Map<string, number>()
    for (const p of list) {
      if (!p.parentId) continue
      const parent = desks.get(p.parentId)
      if (!parent) continue
      const n = helpers.get(p.parentId) || 0
      helpers.set(p.parentId, n + 1)
      const out = parent.face === 0 ? -1 : 1
      const along = ((n % 3) - 1) * 0.9
      const back = 0.95 + Math.floor(n / 3) * 0.75
      desks.set(p.id, { pos: v3(parent.pos.x + along, parent.pos.z + out * back), face: parent.face, seated: false })
    }

    for (const p of list) {
      const desk = desks.get(p.id)
      if (!desk) continue
      seen.add(p.id)
      let actor = this.people.get(p.id)
      if (!actor) {
        actor = this.addPerson(p, desk, this.firstSync ? -10 : t)
        // Already idle when the view opens: they are in the common room.
        if (this.firstSync && !p.parentId && calm(p.status)) this.goLeisure(actor, true)
      } else if (actor.dying !== null) {
        continue
      }
      if (p.status !== actor.data.status && actor.leaving === null) {
        if (p.status === 'done') this.say(actor, '✓', 4)
        if (p.status === 'working' && actor.data.status !== 'working') this.say(actor, '💬', 2.5)
        if (calm(p.status) && !calm(actor.data.status)) actor.calmSince = t
      }
      actor.data = p
      actor.desk = desk
      this.paintChip(actor)
      this.speak(actor, t)
      this.react(actor, t)
    }
    for (const actor of this.people.values()) {
      if (!seen.has(actor.data.id) && actor.dying === null) {
        actor.dying = t
        this.release(actor)
        actor.summon = this.summonFx(actor.pos, this.rooms.get(actor.data.roomId)?.color || '#b48cff', 26)
      }
    }
  }

  private addPerson(p: SimPerson, desk: PersonActor['desk'], born: number): PersonActor {
    const fig = figure({ seed: hashOf(p.id), role: p.role, sub: !!p.parentId })
    fig.group.position.copy(desk.pos)
    tag(fig.group, { kind: 'person', id: p.id })
    this.scene.add(fig.group)

    const el = document.createElement('div')
    el.className = 'sim-tag'
    const speech = document.createElement('div')
    speech.className = 'sim-say'
    speech.style.display = 'none'
    const bubble = document.createElement('div')
    bubble.className = 'sim-bubble'
    const chip = document.createElement('div')
    chip.className = 'sim-chip'
    el.append(speech, bubble, chip)
    const label = new CSS2DObject(el)
    label.position.set(0, p.parentId ? 2.45 : 2.25, 0)
    fig.group.add(label)

    const color = this.rooms.get(p.roomId)?.color || '#b48cff'
    const actor: PersonActor = {
      data: p, fig, label, chip, bubble, bubbleUntil: 0, speech, saidAt: 0, speechUntil: 0, born, dying: null,
      summon: born > 0 ? this.summonFx(desk.pos, color, 46) : null,
      pos: desk.pos.clone(), face: desk.face, desk, mode: 'desk', dest: 'desk', path: [], trail: [], spot: null,
      calmSince: born, restless: 0, leaving: null, gone: false, stride: 0, pad: null, cue: null, book: null, react: null, reactedAt: p.result?.at || 0, phase: (hashOf(p.id) % 1000) / 160,
      shown: { talk: false, bubble: true, wait: false },
    }
    if (actor.summon) this.say(actor, '✨', 2.5)
    this.people.set(p.id, actor)
    return actor
  }

  private paintChip(a: PersonActor) {
    const p = a.data
    const key = `${p.name}|${p.role}|${p.status}|${p.parentId ? 1 : 0}`
    if (a.chip.dataset.key === key) return
    a.chip.dataset.key = key
    a.chip.classList.toggle('sim-chip-sub', !!p.parentId)
    const dot = document.createElement('i')
    dot.style.background = STATUS_COLOR[p.status]
    const name = document.createElement('b')
    name.textContent = p.name
    const role = document.createElement('span')
    role.textContent = p.parentId ? 'Subagent' : ROLE_LABEL[p.role]
    a.chip.replaceChildren(dot, name, role)
  }

  /**
   * Says Claude's newest line over their head while they work: what it wrote for a while, what
   * it is doing for a moment. Lines from before the view opened only show if they are recent.
   */
  private speak(a: PersonActor, t: number) {
    const line = a.data.line
    if (!line || line.at === a.saidAt) return
    a.saidAt = line.at
    if (a.data.status !== 'working' || Date.now() - line.at > 20_000) return
    a.speech.textContent = line.text
    a.speech.classList.toggle('sim-say-doing', line.kind === 'doing')
    a.speechUntil = t + (line.kind === 'said' ? 8 : 4.5)
  }

  /**
   * Reacts to a command finishing while Claude works: cheers when tests pass, a puff of smoke and a
   * groan when tests or a command fail. Old results, from before the view opened, are ignored.
   */
  private react(a: PersonActor, t: number) {
    const r = a.data.result
    if (!r || r.at === a.reactedAt) return
    a.reactedAt = r.at
    if (Date.now() - r.at > 20_000 || a.leaving !== null || (r.ok && !r.test)) return
    a.react = { ok: r.ok, test: r.test, until: t + 3.2 }
    if (r.ok) this.say(a, 'Tests pass! ✅', 3.2)
    else {
      this.say(a, r.test ? 'Tests failed 💥' : 'Oops 💥', 3.2)
      this.puff(a)
    }
  }

  private puffs: { points: THREE.Points; vel: THREE.Vector3[]; born: number }[] = []

  /** A little cloud of smoke rising off someone's head. */
  private puff(a: PersonActor) {
    this.smoke(a.pos.clone().setY(a.data.parentId ? 1.6 : 2))
  }

  /** A little cloud of smoke rising from a point. */
  private smoke(at: THREE.Vector3) {
    const n = 18
    const positions = new Float32Array(n * 3)
    const vel: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      positions.set([at.x + (Math.random() - 0.5) * 0.4, at.y + Math.random() * 0.2, at.z + (Math.random() - 0.5) * 0.4], i * 3)
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ map: spark(), color: '#6b6f7a', size: 0.55, transparent: true, depthWrite: false }))
    this.scene.add(points)
    this.puffs.push({ points, vel, born: this.clock.elapsedTime })
  }

  private stepPuffs(t: number, dt: number) {
    for (let k = this.puffs.length - 1; k >= 0; k--) {
      const p = this.puffs[k]!
      const age = (t - p.born) / 2.2
      const pos = p.points.geometry.getAttribute('position') as THREE.BufferAttribute
      p.vel.forEach((v, i) => pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt))
      pos.needsUpdate = true
      const m = p.points.material as THREE.PointsMaterial
      m.opacity = 0.85 * (1 - age)
      m.size = 0.55 + age * 0.6
      if (age < 1) continue
      this.scene.remove(p.points)
      p.points.geometry.dispose()
      m.dispose()
      this.puffs.splice(k, 1)
    }
  }

  /** A short speech bubble over someone's head. */
  private say(a: PersonActor, text: string, seconds: number) {
    a.bubble.textContent = text
    a.bubbleUntil = this.clock.elapsedTime + seconds
  }

  private removePerson(a: PersonActor) {
    this.release(a)
    this.scene.remove(a.fig.group)
    a.label.element.remove()
    a.fig.group.remove(a.label)
    if (a.summon) this.clearSummon(a.summon)
    this.people.delete(a.data.id)
  }

  // ------------------------------------------------------------ getting about

  private release(a: PersonActor) {
    if (a.spot?.taken === a.data.id) a.spot.taken = null
    a.spot = null
  }

  /**
   * A free spot in the common room or by the stage: a random activity, then a random spot for it,
   * so the dance floor's many spots do not crowd out the rest. Something other than `not` if it can.
   */
  private claim(a: PersonActor, not?: SpotKind): Spot {
    const free = this.spots.filter(s => !s.taken)
    const kinds = [...new Set(free.map(s => s.kind))]
    const fresh = kinds.filter(k => k !== not)
    const fun = fresh.filter(k => k !== 'chat')
    const choice = fun.length && Math.random() < 0.85 ? fun : fresh.length ? fresh : kinds
    const kind = choice[Math.floor(Math.random() * choice.length)]
    const pool = free.filter(s => s.kind === kind)
    let s = pool[Math.floor(Math.random() * pool.length)]
    if (!s) {
      // Everywhere is taken: hang about near the middle.
      const zc = HALL + COMMON_D / 2
      const x = (Math.random() - 0.5) * 6
      s = { kind: 'chat', x, z: zc + 2.6 + Math.random() * 1.2, face: Math.PI, lane: x, sit: null, taken: null }
    }
    s.taken = a.data.id
    return s
  }

  /** The way from a person's desk to a spot: out past the desks, through the door, down the hall and over. */
  private route(a: PersonActor, spot: Spot): THREE.Vector3[] {
    const room = this.rooms.get(a.data.roomId)
    const walkZ = HALL / 2
    if (!room) return [v3(spot.lane, walkZ), v3(spot.lane, spot.z), v3(spot.x, spot.z)]
    const { center } = room
    const doorZ = center.z + ROOM_D / 2
    const side = a.desk.pos.x >= center.x ? 1 : -1
    const ex = center.x + side * (room.podHalf + 0.9)
    const pts = [v3(ex, a.desk.pos.z), v3(ex, doorZ - 1), v3(center.x, doorZ - 1), v3(center.x, doorZ + HALL / 2)]
    if (room.row > 0) {
      // Back rows: along the hall to the side aisle, then down it to the common room.
      const ax = (center.x >= 0 ? 1 : -1) * this.aisleX
      pts.push(v3(ax, doorZ + HALL / 2), v3(ax, walkZ))
    }
    pts.push(v3(spot.lane, walkZ), v3(spot.lane, spot.z), v3(spot.x, spot.z))
    return pts
  }

  /** Off to the common room. `now` puts them straight there, for those already idle when the view opens. */
  private goLeisure(a: PersonActor, now = false) {
    const spot = this.claim(a)
    a.spot = spot
    if (now) {
      a.mode = 'leisure'
      a.pos.set(spot.x, 0, spot.z)
      a.face = spot.face
      // Staggered, so the room does not all get up at once.
      a.restless = this.clock.elapsedTime + 5 + Math.random() * 30
      return
    }
    if (a.mode === 'walk') {
      // Turned round on the way back: retrace the steps, then on to the new spot.
      a.path = [...a.trail].reverse()
      a.path[a.path.length - 1] = v3(spot.x, spot.z)
    } else {
      a.path = this.route(a, spot)
    }
    a.trail = [a.pos.clone()]
    a.mode = 'walk'
    a.dest = 'leisure'
  }

  /**
   * Bored of this spot: off to do something else. Back up the lane to the walkway and down another.
   * The trail starts with the whole way here from the desk, so a call back to work retraces it.
   */
  private wander(a: PersonActor) {
    const old = a.spot
    if (!old) return
    const spot = this.claim(a, old.kind)
    this.release(a)
    a.spot = spot
    spot.taken = a.data.id
    const walkZ = HALL / 2
    a.trail = this.route(a, old)
    a.path = [v3(old.lane, old.z), v3(old.lane, walkZ), v3(spot.lane, walkZ), v3(spot.lane, spot.z), v3(spot.x, spot.z)]
    a.mode = 'walk'
    a.dest = 'leisure'
  }

  /** Back to the desk, because Claude has something on. */
  private goDesk(a: PersonActor) {
    const spot = a.spot
    this.release(a)
    if (a.mode === 'walk') {
      a.path = [...a.trail].reverse()
    } else {
      a.path = spot ? this.route(a, spot).reverse().slice(1) : []
    }
    a.path.push(a.desk.pos.clone())
    a.trail = [a.pos.clone()]
    a.mode = 'walk'
    a.dest = 'desk'
  }

  /** Steps along the path; true on arrival. */
  private walk(a: PersonActor, dt: number) {
    let left = WALK_SPEED * dt
    while (left > 0 && a.path.length) {
      const next = a.path[0]!
      const to = this.step.copy(next).sub(a.pos)
      const d = to.length()
      if (d > 0.001) a.face = Math.atan2(to.x, to.z)
      if (d <= left) {
        a.pos.copy(next)
        a.trail.push(next.clone())
        a.path.shift()
        left -= d
      } else {
        a.pos.addScaledVector(to, left / d)
        left = 0
      }
    }
    a.stride += dt * 9
    return a.path.length === 0
  }

  // ------------------------------------------------------------ summoning

  private summonFx(at: THREE.Vector3, color: string, count: number): Summon {
    const rune = runeCircle(color)
    rune.mesh.position.set(at.x, 0.08, at.z)
    const pillar = lightPillar(color)
    pillar.mesh.position.set(at.x, 2, at.z)
    const positions = new Float32Array(count * 3)
    const velocities: THREE.Vector3[] = []
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.7
      positions.set([at.x + Math.cos(a) * r, 0.1 + Math.random() * 0.4, at.z + Math.sin(a) * r], i * 3)
      velocities.push(new THREE.Vector3(Math.cos(a) * 0.25, 1.2 + Math.random() * 2.2, Math.sin(a) * 0.25))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      map: spark(), color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35), size: 0.22,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    this.scene.add(rune.mesh, pillar.mesh, points)
    return { rune, pillar, points, velocities }
  }

  private clearSummon(s: Summon) {
    this.scene.remove(s.rune.mesh, s.pillar.mesh, s.points)
    // Their textures are the kit's, shared by every summon in the colour.
    s.rune.material.dispose()
    s.pillar.material.dispose()
    s.points.geometry.dispose()
    ;(s.points.material as THREE.Material).dispose()
  }

  /** Runs a summon's circle, light and sparks: `p` is 0 to 1 through it. */
  private stepSummon(s: Summon, p: number, dt: number) {
    const grow = clamp01(p / 0.25), fade = 1 - clamp01((p - 0.7) / 0.3)
    s.rune.mesh.scale.setScalar(0.2 + 0.8 * easeOutBack(grow))
    s.rune.mesh.rotation.z += dt * 2.4
    s.rune.material.opacity = grow * fade
    s.pillar.material.opacity = Math.sin(Math.PI * clamp01(p / 0.75)) * 0.85
    s.pillar.mesh.scale.set(1 - p * 0.6, 0.3 + clamp01(p * 2) * 0.7, 1 - p * 0.6)
    const pos = s.points.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < s.velocities.length; i++) {
      const v = s.velocities[i]!
      pos.setXYZ(i, pos.getX(i) + v.x * dt, pos.getY(i) + v.y * dt, pos.getZ(i) + v.z * dt)
    }
    pos.needsUpdate = true
    ;(s.points.material as THREE.PointsMaterial).opacity = fade
  }

  // ------------------------------------------------------------ frame

  private drawnAt = 0

  private loop = (now = 0) => {
    this.frame = requestAnimationFrame(this.loop)
    if (!this.active) return
    // The browser stops frames for a hidden window. Behind other apps, nobody needs 60 a second,
    // nor while the camera is still: full rate only while it moves, or the pointer has just moved.
    const busy = this.dragging || !!this.fly || !!this.follow || now < this.busyUntil
    const every = !document.hasFocus() ? 50 : busy ? 0 : 1000 / AMBIENT_FPS - 2
    if (now - this.drawnAt < every) return
    this.drawnAt = now
    const dt = Math.min(0.12, this.clock.getDelta())
    const t = this.clock.elapsedTime
    this.updateFrustum()
    this.stepRooms(t, dt)
    this.stepLights(t, dt)
    this.stepCommon(t)
    this.stepBand(t)
    this.stepPeople(t, dt)
    this.stepCore(t, dt)
    this.hq?.step(t, dt)
    this.dc?.step(t, dt)
    this.stepPuffs(t, dt)
    this.stepWeather(t, dt)
    this.stepFly(t)
    this.stepFollow()
    this.controls.update()
    this.stepHover()
    if (t - this.shadowAt >= 1 / SHADOW_HZ) {
      this.shadowAt = t
      this.renderer.shadowMap.needsUpdate = true
    }
    this.renderer.render(this.scene, this.camera)
    // Name tags at half rate while the camera is still: people walk slowly enough for it.
    if (busy || now - this.labelsAt > 2 * (1000 / AMBIENT_FPS) - 4) {
      this.labelsAt = now
      this.labels.render(this.scene, this.camera)
    }
    this.countFrame(now)
  }

  /** Frames drawn in the last second, for the frame rate readout. */
  private countFrame(now: number) {
    const f = this.fps
    f.frames++
    if (!f.from) f.from = now
    if (now - f.from < 1000) return
    this.opts.onFps?.(Math.round((f.frames * 1000) / (now - f.from)))
    f.frames = 0
    f.from = now
  }

  private updateFrustum() {
    this.camera.updateMatrixWorld()
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProj)
  }

  /** Whether a screen is on camera, worth painting. */
  private inView(o: THREE.Mesh) {
    return this.frustum.intersectsObject(o)
  }

  /**
   * Lends the real lights to the lit places nearest the camera's target, a few times a second;
   * each fades out of where it was before fading in where it is wanted.
   */
  private stepLights(t: number, dt: number) {
    if (t >= this.glowAt) {
      this.glowAt = t + 0.3
      const target = this.controls.target
      const wanted = this.glows.filter(g => g.level() > 0.02).sort((a, b) => a.at.distanceToSquared(target) - b.at.distanceToSquared(target)).slice(0, LIGHT_SLOTS)
      for (const s of this.slots) if (s.glow && !wanted.includes(s.glow)) s.glow.real = -1
      for (const g of wanted) {
        const held = this.slots.find(s => s.glow === g)
        if (held) {
          g.real = held.k
          continue
        }
        const free = this.slots.find(s => !s.glow)
        if (!free) break
        free.glow = g
        free.k = 0
        free.light.position.copy(g.at)
        free.light.color.set(g.color)
      }
    }
    for (const s of this.slots) {
      const g = s.glow
      if (!g) continue
      // Marked as no longer wanted: fade out, then free the light.
      const leaving = g.real < 0
      s.k = leaving ? s.k - dt * 3 : Math.min(1, s.k + dt * 3)
      if (s.k <= 0) {
        g.real = 0
        s.glow = null
        s.k = 0
        s.light.intensity = 0
        continue
      }
      if (!leaving) g.real = s.k
      s.light.intensity = s.k * g.level() * g.strength
    }
    for (const g of this.glows) if (g.pool) g.pool.opacity = 0.22 + 0.12 * (1 - Math.max(0, g.real))
  }

  private stepRooms(t: number, dt: number) {
    for (const r of this.rooms.values()) {
      const since = t - r.switchedAt
      if (r.on) {
        // Lights coming on flicker a few times, like old office tubes.
        if (since < 0.6) r.lit = (Math.floor(since * 22) * 7919) % 5 < 2 ? 0.15 : 0.95
        else r.lit = Math.min(1, r.lit + dt * 4)
      } else {
        r.lit = Math.max(0, r.lit - dt * 2.2)
      }
      const l = r.lit
      r.lamp.emissiveIntensity = l * 1.8
      r.monitors.emissiveIntensity = 0.05 + l * 0.85
      // Without a real light of its own, the pool on the floor does more of the work.
      r.pool.opacity = 0.35 * l * (1 + 0.6 * (1 - Math.max(0, r.glow.real)))
      r.screen.material.emissiveIntensity = 0.1 + l * 0.9
    }
  }

  /** Today's day count; the common room's lineup follows it. */
  private today() {
    return dayNumber()
  }

  /** The football on the big TV, the racing game on the other, the arcade, the ping pong ball and the air hockey puck. */
  private stepCommon(t: number) {
    // Past midnight: lay the room out again for the new day's lineup.
    if (t >= this.dayCheck) {
      this.dayCheck = t + 30
      if (this.rebuild && this.today() !== this.day) this.rebuild()
    }
    if (this.arcadeGlow) this.arcadeGlow.emissive.setHSL((t * 0.08) % 1, 0.8, 0.55)
    const f = this.football
    if (f && t >= f.next) {
      f.next = t + 1 / 12
      if (t >= f.nextGoal) {
        f.goals[Math.random() < 0.5 ? 0 : 1]++
        f.goalUntil = t + 3
        f.nextGoal = t + 22 + Math.random() * 25
      }
      if (this.inView(f.face)) {
        drawFootball(f.canvas, t, f.goals, t < f.goalUntil)
        f.texture.needsUpdate = true
      }
    }
    const g = this.game
    if (g && t >= g.next) {
      g.next = t + 1 / 15
      if (this.inView(g.face)) {
        drawRacing(g.canvas, t)
        g.texture.needsUpdate = true
      }
    }
    const p = this.pong
    if (p) {
      const playing = this.spots.some(s => s.kind === 'pong' && s.taken && this.people.get(s.taken)?.mode === 'leisure')
      p.ball.visible = playing
      if (playing) {
        const u = (t * 0.7) % 2, k = u < 1 ? u : 2 - u
        p.ball.position.set(p.x - 1.35 + k * 2.7, 0.8 + Math.abs(Math.sin(k * Math.PI * 2)) * 0.32, p.z + Math.sin(t * 1.3) * 0.4)
      }
    }
    const h = this.hockey
    if (h) {
      // The puck bounces off the side rails on its way end to end; each mallet follows it near its own goal.
      const playing = this.spots.some(s => s.kind === 'hockey' && s.taken && this.people.get(s.taken)?.mode === 'leisure')
      const u = playing ? (t * 0.9) % 2 : 0.5, k = u < 1 ? u : 2 - u
      const px = -0.78 + k * 1.56
      const w = (t * 1.7) % 2, pz = playing ? ((w < 1 ? w : 2 - w) - 0.5) * 0.76 : 0
      h.puck.position.x = px
      h.puck.position.z = pz
      h.mallets.forEach((m, i) => {
        m.position.z = THREE.MathUtils.lerp(m.position.z, playing ? pz * 0.8 : 0, 0.15)
        m.position.x = (i ? 1 : -1) * (0.82 - (Math.abs(px) > 0.6 && Math.sign(px) === (i ? 1 : -1) ? 0.08 : 0))
      })
    }
  }

  private stepPeople(t: number, dt: number) {
    // Removing the one being visited is safe while walking a Map.
    for (const a of this.people.values()) {
      const { fig } = a
      if (a.leaving !== null) {
        // Saying goodbye: turned to the camera, then the session closes and they vanish.
        const cam = this.camera.position
        a.face = Math.atan2(cam.x - a.pos.x, cam.z - a.pos.z)
        if (!a.gone && t - a.leaving > 2.2) {
          a.gone = true
          this.opts.onFarewell(a.data.id)
        }
      } else if (a.dying === null && !a.data.parentId) {
        const wantOut = calm(a.data.status)
        if (wantOut && a.mode === 'desk' && !a.summon && t - a.calmSince > 3.5) this.goLeisure(a)
        else if (!wantOut && (a.mode === 'leisure' || (a.mode === 'walk' && a.dest === 'leisure'))) this.goDesk(a)
        else if (a.mode === 'leisure' && t > a.restless) this.wander(a)
      }
      if (a.leaving !== null) {
        // Stays where they are.
      } else if (a.mode === 'walk') {
        if (this.walk(a, dt)) {
          a.mode = a.dest
          a.face = a.dest === 'desk' ? a.desk.face : a.spot?.face ?? a.face
          a.restless = t + (a.spot?.kind === 'chat' ? 12 : 20) + Math.random() * 30
        }
      } else if (a.mode === 'desk') {
        // Glide to a new seat when the desks are rearranged.
        a.pos.lerp(a.desk.pos, 1 - Math.exp(-dt * 4))
        a.face = a.desk.face
      }
      fig.group.position.copy(a.pos)
      fig.group.rotation.y = a.face

      let scale = 1, lift = 0, spin = 0
      if (a.dying !== null) {
        const q = clamp01((t - a.dying) / 0.9)
        scale = 1 - q * q
        spin = q * q * Math.PI * 3
        lift = q * 0.6
        if (a.summon) this.stepSummon(a.summon, q, dt)
        if (q >= 1) {
          this.removePerson(a)
          continue
        }
      } else if (a.summon) {
        const p = clamp01((t - a.born) / 1.8)
        this.stepSummon(a.summon, p, dt)
        const e = clamp01((p - 0.2) / 0.6)
        scale = e <= 0 ? 0.001 : easeOutBack(e)
        spin = (1 - e) * Math.PI * 4
        lift = (1 - e) * 1.2
        if (p >= 1) {
          this.clearSummon(a.summon)
          a.summon = null
        }
      }
      const base = a.data.parentId ? 0.78 : 1
      fig.group.scale.setScalar(Math.max(0.001, scale * base))
      fig.rig.rotation.y = spin
      fig.group.position.y = lift

      this.pose(a, t)
      // The label's DOM is only touched when what it shows changes.
      const shown = a.shown
      const talking = t < a.speechUntil && a.mode === 'desk' && a.data.status === 'working' && a.dying === null
      if (talking !== shown.talk) {
        shown.talk = talking
        a.speech.style.display = talking ? '' : 'none'
      }
      const waiting = a.data.status === 'waiting' && t >= a.bubbleUntil && a.leaving === null
      const bubble = t < a.bubbleUntil || waiting
      if (bubble !== shown.bubble) {
        shown.bubble = bubble
        a.bubble.style.display = bubble ? '' : 'none'
      }
      if (waiting !== shown.wait) {
        shown.wait = waiting
        if (waiting) a.bubble.textContent = '!'
        a.bubble.classList.toggle('sim-bubble-wait', waiting)
      }
    }
  }

  /** Every pose: walking, at the desk by status, or whatever the common room spot is for. */
  private pose(a: PersonActor, t: number) {
    const { fig } = a
    const ph = t + a.phase
    const [la, ra] = fig.arms
    const [ll, rl] = fig.legs
    const stand = () => {
      fig.rig.position.set(0, 0, 0)
      ll.rotation.x = rl.rotation.x = 0
    }
    const sit = (y: number) => {
      fig.rig.position.set(0, y, -0.08)
      ll.rotation.x = rl.rotation.x = -1.45
    }
    fig.body.rotation.set(0, 0, 0)
    fig.head.rotation.set(0, 0, 0)
    la.rotation.set(0, 0, -0.12)
    ra.rotation.set(0, 0, 0.12)
    if (fig.tablet) fig.tablet.position.y = 0.95 + Math.sin(ph * 2.2) * 0.04
    const gaming = a.mode === 'leisure' && a.spot?.kind === 'game'
    if (gaming && !a.pad) {
      a.pad = controller()
      a.pad.position.set(0, 0.68, 0.4)
      a.pad.rotation.x = 0.5
      fig.rig.add(a.pad)
    }
    if (a.pad) a.pad.visible = gaming
    const shooting = a.mode === 'leisure' && a.spot?.kind === 'pool'
    if (shooting && !a.cue) {
      a.cue = cue()
      a.cue.position.set(0.06, 0.78, 0.25)
      fig.rig.add(a.cue)
    }
    if (a.cue) a.cue.visible = shooting

    if (a.leaving !== null) {
      // On their feet, waving goodbye with a little bounce.
      stand()
      ra.rotation.x = -2.8
      ra.rotation.z = 0.35 + Math.sin((t - a.leaving) * 11) * 0.4
      la.rotation.x = -0.1
      fig.head.rotation.z = Math.sin((t - a.leaving) * 5.5) * 0.1
      fig.rig.position.y = Math.abs(Math.sin((t - a.leaving) * 5.5)) * 0.04
      return
    }

    if (a.mode === 'walk') {
      stand()
      const s = Math.sin(a.stride)
      ll.rotation.x = s * 0.6
      rl.rotation.x = -s * 0.6
      la.rotation.x = -s * 0.5
      ra.rotation.x = s * 0.5
      fig.rig.position.y = Math.abs(Math.cos(a.stride)) * 0.05
      return
    }

    const reading = a.mode === 'desk' && a.data.status === 'working' && !a.data.parentId && (a.data.act === 'read' || a.data.act === 'plan') && !(a.react && a.react.until > t)
    if (reading && !a.book) {
      a.book = book()
      a.book.position.set(0, 0.82, 0.42)
      a.book.rotation.x = -0.7
      fig.rig.add(a.book)
    }
    if (a.book) a.book.visible = reading

    if (a.mode === 'desk') {
      if (a.desk.seated) sit(0.1)
      else stand()
      const r = a.react && a.react.until > t ? a.react : null
      if (r && r.ok) {
        // Tests pass: both arms up, bouncing in the chair.
        la.rotation.x = ra.rotation.x = -2.9 + Math.sin(ph * 12) * 0.15
        la.rotation.z = -0.35
        ra.rotation.z = 0.35
        fig.rig.position.y += Math.abs(Math.sin(ph * 9)) * 0.1
        fig.head.rotation.x = -0.2
        return
      }
      if (r) {
        // Something failed: head in hands, shaking it.
        la.rotation.x = ra.rotation.x = -2.2
        la.rotation.z = 0.5
        ra.rotation.z = -0.5
        fig.head.rotation.x = 0.25
        fig.head.rotation.y = Math.sin(ph * 10) * 0.25
        fig.body.rotation.x = 0.15
        return
      }
      if (a.data.status === 'working' && !a.data.parentId && this.acting(a, ph)) return
      switch (a.data.status) {
        case 'working':
          // Busy hands on the keyboard, or on the tablet for a subagent.
          la.rotation.x = -1.15 + Math.sin(ph * 17) * 0.12
          ra.rotation.x = -1.15 + Math.sin(ph * 17 + 1.7) * 0.12
          fig.head.rotation.x = 0.12 + Math.sin(ph * 1.3) * 0.04
          // Now and then a stretch, a scratch of the head, a look at the other screen.
          if (Math.sin(ph * 0.23) > 0.96) {
            ra.rotation.x = -2.6
            fig.head.rotation.y = 0.35
          } else if (Math.sin(ph * 0.31 + 2) > 0.93) {
            fig.head.rotation.y = Math.sin(ph * 3) > 0 ? 0.3 : -0.3
          }
          break
        case 'waiting':
          la.rotation.x = 0.05
          ra.rotation.x = -2.9
          ra.rotation.z = 0.25 + Math.sin(ph * 7) * 0.3
          fig.head.rotation.z = Math.sin(ph * 2) * 0.08
          break
        default:
          la.rotation.x = ra.rotation.x = -0.25
          fig.body.rotation.x = -0.12
          fig.head.rotation.x = -0.18
      }
      return
    }

    // In the common room.
    const s = a.spot!
    if (s.sit !== null) sit(s.sit)
    else stand()
    const goal = s.tv === 'football' && (this.football?.goalUntil ?? 0) > t
    switch (s.kind) {
      case 'sofa':
      case 'bean':
        if (goal) {
          la.rotation.x = -2.9 + Math.sin(ph * 12) * 0.2
          ra.rotation.x = -2.9 + Math.sin(ph * 12 + 1) * 0.2
          fig.rig.position.y += Math.abs(Math.sin(ph * 10)) * 0.12
        } else {
          la.rotation.x = ra.rotation.x = -0.6
          fig.body.rotation.x = -0.1
          fig.head.rotation.x = Math.sin(ph * 0.8) * 0.05
        }
        break
      case 'game':
        la.rotation.x = -1.05 + Math.sin(ph * 14) * 0.05
        ra.rotation.x = -1.05 + Math.sin(ph * 15 + 1) * 0.05
        la.rotation.z = -0.35
        ra.rotation.z = 0.35
        fig.body.rotation.x = 0.12
        fig.body.rotation.z = Math.sin(ph * 1.7) * 0.12
        fig.head.rotation.z = Math.sin(ph * 1.7) * 0.15
        break
      case 'pong': {
        const swing = Math.sin(t * 0.7 * Math.PI + (s.face > 0 ? 0 : Math.PI))
        ra.rotation.x = -1.2 + swing * 0.7
        ra.rotation.z = 0.5
        fig.rig.position.x = Math.sin(t * 1.3) * 0.25
        break
      }
      case 'foos':
        la.rotation.x = -1.35 + Math.sin(ph * 11) * 0.15
        ra.rotation.x = -1.35 + Math.sin(ph * 11 + 2) * 0.15
        fig.body.rotation.z = Math.sin(ph * 5) * 0.08
        break
      case 'pool': {
        // Lining up a shot over the cue, then a stroke every few seconds.
        const stroke = (ph % 5) > 4.2 ? Math.sin(((ph % 5) - 4.2) * Math.PI * 2.5) * 0.12 : 0
        fig.body.rotation.x = 0.35
        fig.head.rotation.x = 0.15
        la.rotation.x = -1.35
        ra.rotation.x = -0.9
        la.rotation.z = 0.15
        ra.rotation.z = 0.2
        if (a.cue) {
          a.cue.position.z = 0.25 + stroke
          a.cue.rotation.x = 0.18
        }
        break
      }
      case 'hockey':
        // One hand on the mallet, sliding it after the puck.
        fig.body.rotation.x = 0.25
        ra.rotation.x = -1.25
        ra.rotation.z = 0.25 + Math.sin(t * 1.7 * Math.PI) * 0.2
        la.rotation.x = -0.4
        fig.rig.position.x = Math.sin(t * 1.7 * Math.PI) * 0.06
        break
      case 'board':
        // Elbows on the table, and now and then a move.
        fig.body.rotation.x = 0.15
        la.rotation.x = -1.0
        ra.rotation.x = (ph % 9) < 1.2 ? -1.45 + Math.sin(ph * 8) * 0.1 : -1.0
        fig.head.rotation.x = 0.25 + Math.sin(ph * 0.6) * 0.05
        fig.head.rotation.z = Math.sin(ph * 0.4) * 0.08
        break
      case 'darts':
        if (s.face === 0) {
          // On the line: aim, then a throw every few seconds.
          const u = ph % 4
          ra.rotation.x = u < 3 ? -2.0 : -2.0 + Math.sin((u - 3) * Math.PI) * 1.0
          ra.rotation.z = 0.15
          fig.head.rotation.x = -0.1
        } else {
          // Waiting their turn, arms folded.
          la.rotation.x = ra.rotation.x = -0.9
          la.rotation.z = 0.6
          ra.rotation.z = -0.6
          fig.head.rotation.z = Math.sin(ph * 0.7) * 0.06
        }
        break
      case 'coffee':
        // A sip every few seconds.
        ra.rotation.x = (ph % 6) < 1.3 ? -2.4 : -0.9
        fig.head.rotation.x = (ph % 6) < 1.3 ? -0.2 : 0
        break
      case 'arcade':
        la.rotation.x = -1.2 + Math.sin(ph * 13) * 0.1
        ra.rotation.x = -1.2 + Math.sin(ph * 17 + 1) * 0.14
        fig.body.rotation.z = Math.sin(ph * 2.3) * 0.08
        break
      case 'crowd':
        this.rockOut(a, t)
        break
      default:
        if (Math.sin(ph * 0.17) > 0.55) {
          // A look at the phone between chats.
          la.rotation.x = ra.rotation.x = -1.3
          la.rotation.z = 0.4
          ra.rotation.z = -0.4
          fig.head.rotation.x = 0.35
          break
        }
        // Chatting: hands talk now and then, heads nod.
        la.rotation.x = Math.sin(ph * 0.9) > 0.6 ? -1 + Math.sin(ph * 6) * 0.2 : 0.05
        fig.head.rotation.x = Math.sin(ph * 1.8) * 0.08
    }
  }

  /**
   * At the desk, acting out the tool Claude is using: reading a book while it reads files, leaning in
   * to the terminal for commands, fingers crossed while tests run, chin in hand on the web, pointing
   * a helper off on their way. False for plain typing, which the working pose covers.
   */
  private acting(a: PersonActor, ph: number) {
    const { fig } = a
    const [la, ra] = fig.arms
    switch (a.data.act) {
      case 'read':
      case 'plan':
        la.rotation.x = ra.rotation.x = -1.25
        la.rotation.z = 0.3
        ra.rotation.z = -0.3
        fig.head.rotation.x = 0.32
        // A page turn now and then, or a scribble when planning.
        if (a.data.act === 'plan') ra.rotation.x = -1.35 + Math.sin(ph * 14) * 0.08
        else if (Math.sin(ph * 0.9) > 0.92) ra.rotation.z = -0.9
        fig.head.rotation.y = Math.sin(ph * 0.7) * 0.08
        return true
      case 'run':
        // Leaning in, typing fast.
        fig.body.rotation.x = 0.18
        fig.head.rotation.x = 0.22
        la.rotation.x = -1.2 + Math.sin(ph * 24) * 0.12
        ra.rotation.x = -1.2 + Math.sin(ph * 24 + 1.7) * 0.12
        return true
      case 'test':
        // Hands together, watching the screen, a nervous bounce.
        la.rotation.x = ra.rotation.x = -1.35
        la.rotation.z = 0.45
        ra.rotation.z = -0.45
        fig.head.rotation.x = 0.05
        fig.rig.position.y += Math.abs(Math.sin(ph * 6)) * 0.03
        return true
      case 'web':
        // Chin in one hand, scrolling with the other.
        la.rotation.x = -2.3
        la.rotation.z = 0.55
        ra.rotation.x = -1.1 + Math.sin(ph * 3) * 0.05
        fig.head.rotation.z = -0.15
        fig.head.rotation.x = 0.1
        return true
      case 'delegate':
        // Pointing a helper off to do something.
        ra.rotation.x = -1.6 + Math.sin(ph * 2) * 0.1
        ra.rotation.z = 0.25
        la.rotation.x = -0.3
        fig.head.rotation.y = 0.4
        return true
      default:
        return false
    }
  }

  /** Where the band is: playing a song, on the beat, or in the break between songs cheering. */
  private gig(t: number) {
    const at = t % (SONG + ENCORE)
    const beat = t * 2.2
    return { playing: at < SONG, at, beat, song: Math.floor(t / (SONG + ENCORE)) }
  }

  /** On the dance floor: each in their own way while the band plays, everyone cheering between songs. */
  private rockOut(a: PersonActor, t: number) {
    const { fig } = a
    const [la, ra] = fig.arms
    const { playing, beat } = this.gig(t)
    const ph = t + a.phase
    const hop = Math.abs(Math.sin(beat * Math.PI))
    if (!playing) {
      // Clapping and whooping.
      la.rotation.x = ra.rotation.x = -1.5
      const clap = Math.abs(Math.sin(ph * 9)) * 0.5
      la.rotation.z = -0.1 - clap
      ra.rotation.z = 0.1 + clap
      fig.head.rotation.x = -0.15
      return
    }
    switch (Math.floor(a.phase * 3 + a.data.id.length) % 4) {
      case 0:
        // Fist pumping on the beat.
        fig.rig.position.y = hop * 0.14
        ra.rotation.x = -2.5 - hop * 0.4
        la.rotation.x = -0.4
        break
      case 1:
        // Headbanging.
        fig.head.rotation.x = 0.1 + Math.sin(beat * Math.PI * 2) * 0.35
        fig.body.rotation.x = 0.05 + Math.sin(beat * Math.PI * 2) * 0.1
        la.rotation.x = ra.rotation.x = -0.5
        break
      case 2:
        // Both hands up, swaying side to side.
        la.rotation.x = ra.rotation.x = -2.9
        la.rotation.z = -0.3
        ra.rotation.z = 0.3
        fig.body.rotation.z = Math.sin(beat * Math.PI * 0.5) * 0.14
        fig.rig.position.x = Math.sin(beat * Math.PI * 0.5) * 0.12
        break
      default:
        // Jumping up and down.
        fig.rig.position.y = hop * 0.28
        la.rotation.x = -0.6 - hop * 0.8
        ra.rotation.x = -0.6 - hop * 0.8
    }
  }

  /** The band playing, their lights, the LED wall and the dance floor. */
  private stepBand(t: number) {
    const b = this.band
    if (!b) return
    const { playing, at, beat, song } = this.gig(t)
    const pulse = playing ? Math.abs(Math.sin(beat * Math.PI)) : 0
    const hue = (t * 0.06 + Math.floor(beat / 4) * 0.13) % 1
    b.beams.forEach((m, i) => {
      m.color.setHSL((hue + i * 0.18) % 1, 0.9, 0.6)
      m.opacity = playing ? 0.09 + pulse * 0.1 : 0.04
    })
    b.cans.forEach((c, i) => {
      c.rotation.z = playing ? Math.sin(t * 1.1 + i * 1.3) * 0.38 : 0
      c.rotation.x = playing ? -0.25 + Math.sin(t * 0.8 + i) * 0.2 : -0.1
    })
    b.strip.emissive.setHSL(hue, 0.9, 0.55)
    b.light.color.setHSL(hue, 0.85, 0.6)
    b.light.intensity = playing ? 14 + pulse * 14 : 5
    const crash = playing && Math.floor(beat) % 8 === 0 ? 1 - (beat % 1) : 0
    b.cymbals[0]!.rotation.z = Math.sin(beat * Math.PI * 2) * 0.06 * (playing ? 1 : 0)
    b.cymbals[1]!.rotation.z = crash * 0.25

    for (const m of b.members) {
      const { fig } = m
      const [right, left] = fig.arms
      fig.rig.position.set(0, 0, 0)
      fig.body.rotation.set(0, 0, 0)
      fig.head.rotation.set(0, 0, 0)
      right.rotation.set(0, 0, -0.12)
      left.rotation.set(0, 0, 0.12)
      fig.legs[0].rotation.x = fig.legs[1].rotation.x = 0
      if (m.part === 'drums') {
        fig.rig.position.set(0, 0.06, -0.08)
        fig.legs[0].rotation.x = fig.legs[1].rotation.x = -1.45
      }
      if (!playing) {
        // Taking a bow, then waving to the crowd.
        if (at - SONG < 1.6) {
          fig.body.rotation.x = 0.4
          fig.head.rotation.x = 0.3
        } else {
          right.rotation.x = -2.8
          right.rotation.z = -0.3 - Math.sin(t * 9 + m.phase) * 0.35
        }
        continue
      }
      const ph = beat * Math.PI
      switch (m.part) {
        case 'guitar':
        case 'bass': {
          const fast = m.part === 'guitar' ? 2 : 1
          right.rotation.x = -0.75 + Math.sin(ph * fast) * 0.3
          right.rotation.z = 0.25
          left.rotation.x = -1.1
          left.rotation.z = 0.75 + Math.sin(t * 1.3 + m.phase) * 0.1
          fig.head.rotation.x = 0.15 + Math.abs(Math.sin(ph)) * (m.part === 'guitar' ? 0.3 : 0.12)
          fig.body.rotation.z = Math.sin(ph * 0.5) * 0.08
          // A big jump now and then on the guitar solo.
          if (m.part === 'guitar' && at > SONG * 0.6 && at < SONG * 0.75) fig.rig.position.y = Math.abs(Math.sin(ph)) * 0.25
          break
        }
        case 'drums':
          right.rotation.x = -1.0 + Math.sin(ph * 2) * 0.4
          left.rotation.x = -1.0 + Math.sin(ph * 2 + Math.PI) * 0.4
          if (crash > 0.6) right.rotation.x = -1.8
          fig.head.rotation.x = 0.1 + Math.abs(Math.sin(ph)) * 0.2
          break
        case 'vocals':
          left.rotation.x = -1.5
          left.rotation.z = -0.35
          right.rotation.x = Math.sin(t * 0.7 + song) > 0.3 ? -2.6 + Math.sin(ph) * 0.2 : -0.7 + Math.sin(ph * 0.5) * 0.3
          fig.head.rotation.x = -0.15 + Math.sin(ph) * 0.08
          fig.body.rotation.z = Math.sin(ph * 0.5) * 0.12
          fig.rig.position.y = Math.abs(Math.sin(ph)) * 0.05
      }
    }

    const w = b.wall
    if (t >= w.next && this.inView(w.face)) {
      w.next = t + 1 / 15
      drawLedWall(w.canvas, t, playing, at, song, pulse)
      w.texture.needsUpdate = true
    }
    const f = b.floor
    const tick = playing ? Math.floor(beat) : -1
    if (tick !== f.next && this.inView(f.face)) {
      f.next = tick
      drawDanceFloor(f.canvas, tick, hue)
      f.texture.needsUpdate = true
    }
  }

  // ------------------------------------------------------------ camera

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3) {
    this.fly = { fromPos: this.camera.position.clone(), toPos: pos, fromTarget: this.controls.target.clone(), toTarget: target, start: this.clock.elapsedTime }
  }

  private stepFly(t: number) {
    const f = this.fly
    if (!f) return
    const p = clamp01((t - f.start) / 0.9)
    const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2
    const who = f.offset && this.follow ? this.people.get(this.follow.id) : null
    if (who) {
      // Aim at where they are now, not where they were when the flight began.
      f.toTarget.copy(who.pos)
      f.toPos.copy(who.pos).add(f.offset!)
      this.follow!.last.copy(who.pos)
    }
    this.camera.position.lerpVectors(f.fromPos, f.toPos, e)
    this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e)
    if (p >= 1) this.fly = null
  }

  /** Keeps the camera on the person being followed: it moves with them, still free to turn and zoom. */
  private stepFollow() {
    const f = this.follow
    if (!f || this.fly) return
    const who = this.people.get(f.id)
    if (!who) {
      this.follow = null
      return
    }
    const delta = this.step.copy(who.pos).sub(f.last)
    if (delta.lengthSq() < 1e-8) return
    this.camera.position.add(delta)
    this.controls.target.add(delta)
    f.last.copy(who.pos)
  }

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.opts.container
    if (!w || !h) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.labels.setSize(w, h)
  }

  // ------------------------------------------------------------ pointer

  private pickAt(e: { clientX: number; clientY: number }): Pick | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const targets: THREE.Object3D[] = [this.floor]
    for (const p of this.people.values()) targets.push(p.fig.group)
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      const pick = hit.object.userData.pick as Pick | undefined
      if (pick) return pick
    }
    return null
  }

  /** What is under the pointer, once a frame however often it moves; the card only hears of a new thing or a real move. */
  private stepHover() {
    const at = this.hoverAt
    if (!at) return
    this.hoverAt = null
    const pick = this.pickAt({ clientX: at.x, clientY: at.y })
    this.renderer.domElement.style.cursor = pick ? 'pointer' : ''
    if (!pick) {
      if (this.hovered) this.opts.onHover(null)
      this.hovered = null
      this.hoverShown = null
      return
    }
    const same = this.hovered && this.hovered.kind === pick.kind && this.hovered.id === pick.id
    const last = this.hoverShown
    if (same && last && Math.hypot(at.x - last.x, at.y - last.y) < 6) return
    this.hovered = pick
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.hoverShown = { x: at.x, y: at.y }
    this.opts.onHover({ pick, x: at.x - rect.left, y: at.y - rect.top })
  }

  private onControlStart = () => {
    this.dragging = true
  }

  private onControlEnd = () => {
    this.dragging = false
    this.busyUntil = performance.now() + BUSY_MS
  }

  private onPointerMove = (e: PointerEvent) => {
    this.busyUntil = performance.now() + BUSY_MS
    if (e.buttons) return
    this.hoverAt = { x: e.clientX, y: e.clientY }
  }

  private onPointerDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY }
    this.fly = null
    this.hoverAt = null
    // Panning away lets them go; turning round them with the right button keeps up with them.
    if (e.button !== 2) this.follow = null
    if (this.hovered) this.opts.onHover(null)
    this.hovered = null
    this.hoverShown = null
  }

  private onPointerUp = (e: PointerEvent) => {
    const d = this.down
    this.down = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
    if (e.button === 2) {
      const pick = this.pickAt(e)
      const rect = this.renderer.domElement.getBoundingClientRect()
      if (pick?.kind === 'person') this.opts.onMenu({ pick, x: e.clientX - rect.left, y: e.clientY - rect.top })
      return
    }
    if (e.button !== 0) return
    const pick = this.pickAt(e)
    this.opts.onSelect(pick)
    if (pick) this.focus(pick)
  }

  private onPointerLeave = () => {
    this.renderer.domElement.style.cursor = ''
    this.hoverAt = null
    if (this.hovered) this.opts.onHover(null)
    this.hovered = null
    this.hoverShown = null
  }
}

// ---------------------------------------------------------------- the TVs

/** A screen's canvas drawn as if 1024 wide, whatever its real width, so the TVs can be painted smaller. */
function paint(c: HTMLCanvasElement) {
  const x = c.getContext('2d')!
  const k = c.width / 1024
  x.setTransform(k, 0, 0, k, 0, 0)
  return { x, W: 1024, H: c.height / k }
}

/** The Canopy Core's dashboard: four tiles of memory, CPU, frame rate and lag, each a number over a sparkline of the last two minutes. */
function drawCore(c: HTMLCanvasElement, m: SimMetrics, hot: boolean) {
  const { x, W, H } = paint(c)
  x.fillStyle = '#0f1118'
  x.fillRect(0, 0, W, H)
  x.textBaseline = 'middle'
  x.textAlign = 'left'
  x.fillStyle = '#ffffff'
  x.font = `800 40px ${FONT}`
  x.fillText('CANOPY CORE', 32, 42)
  const state = hot ? 'OVERHEATING' : m.cpu > 40 ? 'BUSY' : 'NOMINAL'
  const sc = hot ? '#ff4d4f' : m.cpu > 40 ? '#f5b544' : '#4cc38a'
  x.font = `700 26px ${FONT}`
  const sw = x.measureText(state).width + 44
  x.fillStyle = sc
  x.beginPath()
  x.roundRect(W - 32 - sw, 22, sw, 40, 20)
  x.fill()
  x.fillStyle = '#0f1118'
  x.fillText(state, W - 32 - sw + 22, 43)

  const mem = m.memMB >= 1024 ? `${(m.memMB / 1024).toFixed(2)} GB` : `${Math.round(m.memMB)} MB`
  const tiles: [string, string, string, number[], number][] = [
    ['MEMORY', mem, '#8fd6ff', m.history.map(h => h.memMB), 0],
    ['CPU', `${m.cpu.toFixed(1)}%`, '#4cc38a', m.history.map(h => h.cpu), 10],
    ['3D WORLD', `${m.fps} fps`, '#b48cff', m.history.map(h => h.fps), 60],
    ['MAIN LAG', `${Math.round(m.lagMs)} ms`, hot ? '#ff4d4f' : '#f5b544', m.history.map(h => h.lagMs), 20],
  ]
  const tw = (W - 64 - 24) / 2, th = (H - 96 - 16 - 24) / 2
  tiles.forEach(([label, value, color, series, floor], i) => {
    const tx = 32 + (i % 2) * (tw + 24), ty = 88 + Math.floor(i / 2) * (th + 16)
    x.fillStyle = 'rgba(255,255,255,.05)'
    x.beginPath()
    x.roundRect(tx, ty, tw, th, 16)
    x.fill()
    x.fillStyle = 'rgba(255,255,255,.55)'
    x.font = `600 22px ${FONT}`
    x.fillText(label, tx + 22, ty + 28)
    x.fillStyle = color
    x.font = `800 52px ${FONT}`
    x.fillText(value, tx + 22, ty + 78, tw * 0.45)
    // The sparkline on the right of the tile, scaled to its own peak (or a floor, so calm stays flat).
    const n = series.length
    if (n < 2) return
    const max = Math.max(floor, ...series) || 1
    const lx = tx + tw * 0.48, lw = tw * 0.48 - 18, ly = ty + 20, lh = th - 40
    x.beginPath()
    series.forEach((v, k) => {
      const px = lx + (k / (n - 1)) * lw, py = ly + lh - (Math.max(0, v) / max) * lh
      if (k) x.lineTo(px, py)
      else x.moveTo(px, py)
    })
    x.strokeStyle = color
    x.lineWidth = 4
    x.lineJoin = 'round'
    x.stroke()
    x.lineTo(lx + lw, ly + lh)
    x.lineTo(lx, ly + lh)
    x.closePath()
    x.globalAlpha = 0.15
    x.fillStyle = color
    x.fill()
    x.globalAlpha = 1
  })
}

/** A football match from above: two teams chasing the ball, the score and the clock, and GOAL! now and then. */
function drawFootball(c: HTMLCanvasElement, t: number, goals: [number, number], goal: boolean) {
  const { x, W, H } = paint(c)
  for (let i = 0; i < 10; i++) {
    x.fillStyle = i % 2 ? '#3f9b55' : '#46a85d'
    x.fillRect((i * W) / 10, 0, W / 10 + 1, H)
  }
  x.strokeStyle = 'rgba(255,255,255,.85)'
  x.lineWidth = 6
  const m = 40
  x.strokeRect(m, m, W - 2 * m, H - 2 * m)
  x.beginPath()
  x.moveTo(W / 2, m)
  x.lineTo(W / 2, H - m)
  x.stroke()
  x.beginPath()
  x.arc(W / 2, H / 2, H * 0.16, 0, Math.PI * 2)
  x.stroke()
  for (const gx of [m, W - m - 110]) x.strokeRect(gx, H / 2 - 120, 110, 240)

  const bx = W / 2 + Math.sin(t * 0.47) * Math.cos(t * 0.19) * (W * 0.36)
  const by = H / 2 + Math.sin(t * 0.83 + 1) * (H * 0.3)
  const team = (color: string, side: number) => {
    x.fillStyle = color
    for (let i = 0; i < 6; i++) {
      const hx = W / 2 + side * (W * 0.1 + (i % 3) * W * 0.12)
      const hy = H * (0.22 + Math.floor(i / 3) * 0.5 + (i % 3) * 0.03)
      // Each player drifts from their position towards the ball.
      const k = 0.25 + (i % 3) * 0.12
      const px = hx + (bx - hx) * k + Math.sin(t * 1.7 + i) * 14
      const py = hy + (by - hy) * k + Math.cos(t * 1.3 + i * 2) * 14
      x.beginPath()
      x.arc(px, py, 16, 0, Math.PI * 2)
      x.fill()
    }
  }
  team('#e85f5c', -1)
  team('#5b9cff', 1)
  x.fillStyle = '#ffffff'
  x.beginPath()
  x.arc(bx, by, 10, 0, Math.PI * 2)
  x.fill()

  x.fillStyle = 'rgba(15,17,24,.82)'
  x.beginPath()
  x.roundRect(24, 20, 330, 64, 12)
  x.fill()
  x.font = `700 38px ${FONT}`
  x.textBaseline = 'middle'
  x.textAlign = 'left'
  x.fillStyle = '#ffffff'
  x.fillText(`CAN ${goals[0]} - ${goals[1]} CLD`, 42, 53)
  x.fillStyle = '#f2c94c'
  x.fillText(`${Math.floor(t / 2) % 90 + 1}'`, 290, 53)
  if (goal) {
    x.fillStyle = 'rgba(0,0,0,.35)'
    x.fillRect(0, 0, W, H)
    x.textAlign = 'center'
    x.font = `800 ${140 + Math.sin(t * 12) * 10}px ${FONT}`
    x.fillStyle = '#f2c94c'
    x.fillText('GOAL!', W / 2, H / 2)
  }
}

/** A neon racing game: a sunset, a grid road rushing past and two karts weaving. */
function drawRacing(c: HTMLCanvasElement, t: number) {
  const { x, W, H } = paint(c)
  const horizon = H * 0.45
  const sky = x.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#1a0b3a')
  sky.addColorStop(1, '#ff4fa3')
  x.fillStyle = sky
  x.fillRect(0, 0, W, horizon)
  x.fillStyle = '#ffd34f'
  x.beginPath()
  x.arc(W / 2, horizon, 110, Math.PI, 0)
  x.fill()
  x.fillStyle = '#120626'
  x.fillRect(0, horizon, W, H - horizon)
  x.strokeStyle = '#ff4fd8'
  x.lineWidth = 3
  for (let i = 0; i < 12; i++) {
    const f = ((i + (t * 2) % 1) / 12) ** 2
    const y = horizon + f * (H - horizon)
    x.beginPath()
    x.moveTo(0, y)
    x.lineTo(W, y)
    x.stroke()
  }
  for (let i = -8; i <= 8; i++) {
    x.beginPath()
    x.moveTo(W / 2 + i * 20, horizon)
    x.lineTo(W / 2 + i * 160, H)
    x.stroke()
  }
  const kart = (color: string, off: number) => {
    const kx = W / 2 + Math.sin(t * 1.6 + off) * W * 0.22, ky = H * 0.8 - off * 40
    x.fillStyle = color
    x.beginPath()
    x.roundRect(kx - 60, ky - 28, 120, 56, 14)
    x.fill()
    x.fillStyle = '#111'
    x.fillRect(kx - 70, ky + 14, 28, 22)
    x.fillRect(kx + 42, ky + 14, 28, 22)
  }
  kart('#4cc38a', 1)
  kart('#5b9cff', 0)
  x.font = `700 34px ${FONT}`
  x.textAlign = 'left'
  x.textBaseline = 'top'
  x.fillStyle = '#ffffff'
  x.fillText(`LAP ${Math.floor(t / 20) % 3 + 1}/3`, 28, 22)
}

// ---------------------------------------------------------------- the stage

const BAND = 'THE SUBAGENTS'
const SONGS = ['Merge Conflict', 'Stack Overflow', 'Null Pointer Blues', 'Hotfix Friday', 'Infinite Loop', 'Rebase Me Baby', 'Works On My Machine']

/** The LED wall behind the band: their name over a pulsing equaliser while they play, thanks between songs. */
function drawLedWall(c: HTMLCanvasElement, t: number, playing: boolean, at: number, song: number, pulse: number) {
  const { x, W, H } = paint(c)
  x.fillStyle = '#0b0912'
  x.fillRect(0, 0, W, H)
  const hue = (t * 22) % 360
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  if (playing) {
    const bars = 32, bw = W / bars
    for (let i = 0; i < bars; i++) {
      const v = (0.25 + 0.75 * Math.abs(Math.sin(t * (2 + (i % 5) * 0.7) + i * 1.7))) * (0.55 + pulse * 0.45)
      const h = v * H * 0.62
      const g = x.createLinearGradient(0, H, 0, H - h)
      g.addColorStop(0, `hsl(${(hue + i * 6) % 360} 90% 55%)`)
      g.addColorStop(1, `hsl(${(hue + 60 + i * 6) % 360} 90% 70%)`)
      x.fillStyle = g
      x.fillRect(i * bw + 3, H - h, bw - 6, h)
    }
    x.shadowColor = `hsl(${hue} 90% 60%)`
    x.shadowBlur = 30
    x.fillStyle = '#ffffff'
    x.font = `800 ${92 + pulse * 8}px ${FONT}`
    x.fillText(BAND, W / 2, H * 0.3, W - 60)
    x.shadowBlur = 0
    x.font = `600 36px ${FONT}`
    x.fillStyle = 'rgba(255,255,255,.75)'
    x.fillText(`♪ ${SONGS[song % SONGS.length]}`, W / 2, H * 0.3 + 78)
  } else {
    x.shadowColor = '#ff4fd8'
    x.shadowBlur = 30
    x.fillStyle = '#ffffff'
    x.font = `800 ${100 + Math.sin(t * 6) * 6}px ${FONT}`
    x.fillText(at - SONG < ENCORE / 2 ? 'THANK YOU!' : 'ONE MORE!', W / 2, H * 0.45, W - 60)
    x.shadowBlur = 0
    x.font = `600 34px ${FONT}`
    x.fillStyle = 'rgba(255,255,255,.7)'
    x.fillText(`Next up: ${SONGS[(song + 1) % SONGS.length]}`, W / 2, H * 0.45 + 90)
  }
}

/** The dance floor's tiles: a new pattern of lit squares on every beat, dark between songs. */
function drawDanceFloor(c: HTMLCanvasElement, tick: number, hue: number) {
  const { x, W, H } = paint(c)
  const cols = 10, rows = 4
  const tw = W / cols, th = H / rows
  x.fillStyle = '#100d18'
  x.fillRect(0, 0, W, H)
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const lit = tick >= 0 && ((i * 7 + r * 13 + tick * 5) % 11) < 4
      const h = ((hue * 360 + ((i + r + tick) % 4) * 60) % 360)
      x.fillStyle = lit ? `hsl(${h} 85% 55%)` : `hsl(${h} 30% 16%)`
      x.fillRect(i * tw + 4, r * th + 4, tw - 8, th - 8)
    }
  }
}
