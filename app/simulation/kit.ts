import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * The workspace simulation's kit, in a soft "chibi" style: rounded furniture, white walls, a warm
 * wood floor, carpets in each project's colour and big-headed people with painted faces. Built
 * from primitives, so there are no assets to ship. Geometry and plain materials are cached by
 * their parameters; `disposeKit()` frees them when the view closes.
 */

const geometries = new Map<string, THREE.BufferGeometry>()
const materials = new Map<string, THREE.Material>()
/** Rune circles by colour: one canvas each, shared by every summon in that colour. */
const runes = new Map<string, THREE.CanvasTexture>()

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geometries.get(key)
  if (!g) {
    g = make()
    geometries.set(key, g)
  }
  return g as T
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function boxGeo(w: number, h: number, d: number) {
  return geo(`box:${r2(w)}:${r2(h)}:${r2(d)}`, () => new THREE.BoxGeometry(w, h, d))
}

/** A rounded box: the shape almost everything here is made of. */
export function roundGeo(w: number, h: number, d: number, radius = 0.06) {
  const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  return geo(`rbox:${r2(w)}:${r2(h)}:${r2(d)}:${r2(r)}`, () => new RoundedBoxGeometry(w, h, d, 3, r))
}

export function mat(color: string | number, opts: THREE.MeshStandardMaterialParameters = {}) {
  const key = `std:${color}:${JSON.stringify(opts)}`
  let m = materials.get(key)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts })
    materials.set(key, m)
  }
  return m as THREE.MeshStandardMaterial
}

export function disposeKit() {
  geometries.forEach(g => g.dispose())
  materials.forEach(m => m.dispose())
  runes.forEach(t => t.dispose())
  planks?.dispose()
  sparkTexture?.dispose()
  pillarTexture?.dispose()
  geometries.clear()
  materials.clear()
  runes.clear()
  planks = null
  sparkTexture = null
  pillarTexture = null
}

const sharedGeometries = () => new Set(geometries.values())
const sharedMaterials = () => new Set(materials.values())

/** Frees what an object built for itself: its own geometry, materials and their textures, not the kit's shared ones. */
export function disposeTree(root: THREE.Object3D) {
  const geos = sharedGeometries(), mats = sharedMaterials()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose()
    if (m.geometry && !geos.has(m.geometry)) m.geometry.dispose()
    for (const x of ([] as THREE.Material[]).concat(m.material || [])) {
      if (mats.has(x)) continue
      const s = x as THREE.MeshStandardMaterial
      s.map?.dispose()
      s.emissiveMap?.dispose()
      x.dispose()
    }
  })
}

const size = new THREE.Vector3()

/** Big enough for its shadow to matter: bodies, furniture and walls, not rods, mugs, balls or curls. */
function bulky(geometry: THREE.BufferGeometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  geometry.boundingBox!.getSize(size)
  const [, mid, big] = [size.x, size.y, size.z].sort((a, b) => a - b)
  return big! >= 0.35 && mid! >= 0.15
}

/** A mesh that takes shadows; it casts one too if `shadows` says so, or by default if it is bulky. */
export function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], shadows?: boolean) {
  const m = new THREE.Mesh(geometry, material)
  m.castShadow = shadows ?? bulky(geometry)
  m.receiveShadow = true
  return m
}

/** A rounded box resting on y = `y` (its bottom), centred on x and z. */
export function rbox(w: number, h: number, d: number, material: THREE.Material, y = 0, radius = 0.06) {
  const m = mesh(roundGeo(w, h, d, radius), material)
  m.position.y = y + h / 2
  return m
}

/** Cheap deterministic randomness, so a person or room looks the same every time. */
export function seeded(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function hashOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return Math.abs(h)
}

/** A project colour, oklch(L C h) as the rest of the app paints it, as a three.js colour. */
export function oklch(l: number, c: number, h: number): THREE.Color {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const cl = (v: number) => THREE.MathUtils.clamp(v, 0, 1)
  return new THREE.Color().setRGB(
    cl(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    cl(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    cl(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
    THREE.LinearSRGBColorSpace,
  )
}

/** Lighten a colour towards white, for floors and walls tinted by a project. */
export function tint(color: string, amount: number) {
  return new THREE.Color(color).lerp(new THREE.Color('#ffffff'), amount).getStyle()
}

function canvasTexture(canvas: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** Marks an object as something the pointer can hover or click. */
export type Pick = { kind: 'room' | 'screen'; id: string } | { kind: 'person'; id: string } | { kind: 'gh'; id: string } | { kind: 'core'; id: string }

export function tag(object: THREE.Object3D, pick: Pick) {
  object.traverse((o) => { o.userData.pick = pick })
}

/**
 * Works out the matrices of something that never moves once, rather than every frame. The `moving`
 * parts, and everything under them, keep working theirs out.
 */
export function freeze(root: THREE.Object3D, moving: THREE.Object3D[] = []) {
  const keep = new Set(moving)
  const walk = (o: THREE.Object3D) => {
    if (keep.has(o)) return
    o.updateMatrix()
    o.matrixAutoUpdate = false
    o.children.forEach(walk)
  }
  walk(root)
}

export const FONT = 'Geist, "Segoe UI", system-ui, sans-serif'

export type FloorLine = { text: string; size: number; color: string; weight?: number }

/** Text painted on a flat plane, the way rooms and the workspace are signed. `draw()` repaints it. */
export function floorText(width: number, depth: number, align: CanvasTextAlign = 'left') {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.max(8, Math.round((1024 * depth) / width))
  const texture = canvasTexture(canvas)
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const plane = mesh(new THREE.PlaneGeometry(width, depth), material, false)
  plane.rotation.x = -Math.PI / 2
  const scale = canvas.width / width
  const draw = (lines: FloorLine[]) => {
    const x = canvas.getContext('2d')!
    x.clearRect(0, 0, canvas.width, canvas.height)
    x.textAlign = align
    x.textBaseline = 'top'
    let y = 0
    const left = align === 'center' ? canvas.width / 2 : 0
    for (const line of lines) {
      const px = line.size * scale
      x.font = `${line.weight ?? 600} ${px}px ${FONT}`
      x.fillStyle = line.color
      x.fillText(line.text, left, y, canvas.width)
      y += px * 1.25
    }
    texture.needsUpdate = true
  }
  return { plane, draw, material }
}

// ---------------------------------------------------------------- floors

function plankCanvas() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  const rand = seeded(11)
  const rows = 8
  for (let r = 0; r < rows; r++) {
    const y = (r * c.height) / rows
    let start = -rand() * 120
    while (start < c.width) {
      const len = 90 + rand() * 90
      const shade = 200 + Math.floor(rand() * 14)
      x.fillStyle = `rgb(${shade}, ${shade - 18}, ${shade - 44})`
      x.fillRect(start, y, len, c.height / rows)
      x.fillStyle = 'rgba(90, 60, 40, .2)'
      x.fillRect(start, y, 2, c.height / rows)
      start += len
    }
    x.fillStyle = 'rgba(90, 60, 40, .24)'
    x.fillRect(0, y, c.width, 2)
  }
  return c
}

let planks: THREE.CanvasTexture | null = null

/** The workspace's warm wood floor, tiled to `w` x `d` world units. */
export function woodFloor(w: number, d: number) {
  planks ??= canvasTexture(plankCanvas(), true)
  const map = planks.clone()
  map.repeat.set(w / 6, d / 6)
  map.needsUpdate = true
  const floor = mesh(boxGeo(w, 0.1, d), new THREE.MeshStandardMaterial({ map, roughness: 0.85 }), false)
  floor.position.y = -0.05
  return floor
}

/** The dark blueprint ground the workspace stands on, with a faint grid. */
export function blueprintGround(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x = c.getContext('2d')!
  x.fillStyle = '#211e2b'
  x.fillRect(0, 0, 128, 128)
  x.strokeStyle = 'rgba(160, 150, 200, .16)'
  x.lineWidth = 2
  x.strokeRect(0, 0, 128, 128)
  const map = canvasTexture(c, true)
  map.repeat.set(size / 6, size / 6)
  const ground = mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map, roughness: 1 }), false)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.12
  return ground
}

export function carpet(w: number, d: number, color: string) {
  const m = mesh(roundGeo(w, 0.04, d, 0.02), mat(color, { roughness: 1 }), false)
  m.position.y = 0.02
  return m
}

/** A soft warm pool of light on the floor under a lamp; its opacity follows the lights. */
export function lightPool(w: number, d: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128)
  g.addColorStop(0, 'rgba(255, 214, 150, 1)')
  g.addColorStop(0.55, 'rgba(255, 200, 130, .45)')
  g.addColorStop(1, 'rgba(255, 190, 120, 0)')
  x.fillStyle = g
  x.fillRect(0, 0, 256, 256)
  const material = new THREE.MeshBasicMaterial({ map: canvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })
  const m = mesh(new THREE.PlaneGeometry(w, d), material, false)
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.06
  return { mesh: m, material }
}

// ---------------------------------------------------------------- walls

const WHITE = '#f4f1ec'
const WOOD = '#d9b48a'

/** Lays a wall group, built along +x from the origin's centre, between two floor points. */
function along(g: THREE.Group, a: THREE.Vector2, b: THREE.Vector2) {
  g.position.set((a.x + b.x) / 2, 0, (a.y + b.y) / 2)
  g.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x)
  return g
}

/** The sign over a room's door: the project's colour with its name in white. */
export function doorSign(name: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 96
  const x = c.getContext('2d')!
  x.fillStyle = color
  x.beginPath()
  x.roundRect(0, 0, 512, 96, 24)
  x.fill()
  x.fillStyle = '#ffffff'
  x.font = `700 52px ${FONT}`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(name, 256, 52, 470)
  const material = new THREE.MeshStandardMaterial({ map: canvasTexture(c), transparent: true, roughness: 0.6 })
  const g = new THREE.Group()
  const board = mesh(new THREE.PlaneGeometry(2.4, 0.45), material, false)
  board.position.z = 0.06
  g.add(board)
  const back = mesh(new THREE.PlaneGeometry(2.4, 0.45), material, false)
  back.rotation.y = Math.PI
  back.position.z = -0.06
  g.add(back)
  return g
}

// ---------------------------------------------------------------- furniture

export function officeChair(color: string) {
  const g = new THREE.Group()
  const fabric = mat(color, { roughness: 0.9 })
  g.add(rbox(0.52, 0.12, 0.5, fabric, 0.42, 0.05))
  const back = rbox(0.5, 0.5, 0.1, fabric, 0.56, 0.05)
  back.position.z = -0.22
  back.rotation.x = -0.12
  g.add(back)
  const metal = mat('#4a4f5a', { roughness: 0.4, metalness: 0.3 })
  const stem = mesh(geo('chair-stem', () => new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8)), metal, false)
  stem.position.y = 0.24
  g.add(stem)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const leg = mesh(roundGeo(0.26, 0.04, 0.05, 0.015), metal, false)
    leg.position.set(Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13)
    leg.rotation.y = -a
    g.add(leg)
  }
  return g
}

export type Seat = { x: number; z: number; face: number }

const CHAIRS = ['#3d4250', '#5a6070', '#6b4f7a', '#3f6b70']

/**
 * A pod of desks back to back with a planter strip down the middle and a pair of monitors facing
 * each seat. `screen` is the room's own screen material, so its monitors go dark with its lights.
 */
export function deskPod(seatsPerSide: number, screen: THREE.Material, seed: number) {
  const g = new THREE.Group()
  const rand = seeded(seed)
  const deskW = 1.5
  const width = seatsPerSide * deskW
  const top = mat(WOOD, { roughness: 0.7 })
  const legs = mat('#6b5440', { roughness: 0.7 })
  const seats: Seat[] = []
  for (const side of [-1, 1]) {
    const desk = rbox(width, 0.07, 0.8, top, 0.72, 0.03)
    desk.position.z = side * 0.48
    g.add(desk)
    for (const x of [-width / 2 + 0.06, width / 2 - 0.06]) {
      const leg = rbox(0.06, 0.72, 0.7, legs, 0, 0.02)
      leg.position.set(x, 0, side * 0.48)
      g.add(leg)
    }
    // A seat on the -z side faces +z (towards the planter), and the other way round.
    const facing = side < 0 ? 0 : Math.PI
    for (let i = 0; i < seatsPerSide; i++) {
      const x = -width / 2 + deskW * (i + 0.5)
      for (const dx of [-0.27, 0.27]) {
        const monitor = new THREE.Group()
        monitor.add(rbox(0.5, 0.32, 0.04, mat('#22252d'), 0.08, 0.02))
        const glow = mesh(boxGeo(0.46, 0.28, 0.01), screen, false)
        glow.position.set(0, 0.24, 0.026)
        monitor.add(glow)
        monitor.add(rbox(0.04, 0.1, 0.04, mat('#22252d'), 0, 0.01))
        monitor.position.set(x + dx, 0.79, side * 0.22)
        monitor.rotation.y = facing + Math.PI + (dx < 0 ? 0.18 : -0.18) * (side < 0 ? -1 : 1)
        g.add(monitor)
      }
      const keyboard = rbox(0.42, 0.02, 0.13, mat('#f7f7f7'), 0.79, 0.01)
      keyboard.position.set(x, 0, side * 0.62)
      g.add(keyboard)
      if (rand() > 0.5) {
        const mug = mesh(geo('mug', () => new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10)), mat(['#e98a5b', '#ffffff', '#8fb7a0'][Math.floor(rand() * 3)]!))
        mug.position.set(x + 0.52, 0.84, side * 0.6)
        g.add(mug)
      }
      const chair = officeChair(CHAIRS[Math.floor(rand() * CHAIRS.length)]!)
      chair.position.set(x, 0, side * 1.25)
      chair.rotation.y = facing
      g.add(chair)
      seats.push({ x, z: side * 1.25, face: facing })
    }
  }
  g.add(planter(width - 0.2, rand))
  return { group: g, seats, width }
}

function planter(length: number, rand: () => number) {
  const g = new THREE.Group()
  g.add(rbox(length, 0.16, 0.18, mat('#a77a52', { roughness: 0.8 }), 0.76, 0.03))
  const leaf = mat('#5bab55', { roughness: 0.8, flatShading: true })
  const leafDark = mat('#3f8d45', { roughness: 0.8, flatShading: true })
  const count = Math.floor(length / 0.3)
  for (let i = 0; i < count; i++) {
    const sprig = mesh(geo('sprig', () => new THREE.ConeGeometry(0.09, 0.28, 4)), rand() > 0.5 ? leaf : leafDark, false)
    sprig.position.set(-length / 2 + 0.15 + i * 0.3, 1.04, (rand() - 0.5) * 0.06)
    sprig.rotation.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6)
    g.add(sprig)
  }
  return g
}

/** A pot plant: terracotta pot and a crown of flat, angled leaves. */
export function plant(seed: number, size = 1) {
  const rand = seeded(seed)
  const g = new THREE.Group()
  const pot = mesh(geo('pot', () => new THREE.CylinderGeometry(0.26, 0.2, 0.42, 14)), mat('#c9764f', { roughness: 0.9 }))
  pot.position.y = 0.21
  g.add(pot)
  const leaf = [mat('#5bab55', { flatShading: true }), mat('#3f8d45', { flatShading: true }), mat('#79c26a', { flatShading: true })]
  for (let i = 0; i < 9; i++) {
    const l = mesh(geo('leaf', () => new THREE.ConeGeometry(0.16, 0.9, 4)), leaf[i % 3]!)
    const a = (i / 9) * Math.PI * 2 + rand()
    l.position.set(Math.cos(a) * 0.12, 0.75 + rand() * 0.2, Math.sin(a) * 0.12)
    l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
    g.add(l)
  }
  g.scale.setScalar(size)
  return g
}

/**
 * The room's big wall screen, facing +z. Its face is a canvas the room paints the project's live
 * numbers on; `material` is the room's own, so the screen goes dark with the lights. Screens
 * repainted many times a second use a narrower canvas (`res`), which is cheaper to upload.
 */
export function bigScreen(w: number, h: number, stand = 0, res = 1024) {
  const g = new THREE.Group()
  g.add(rbox(w + 0.16, h + 0.16, 0.1, mat('#1c1e25', { roughness: 0.4 }), -0.08, 0.04))
  // Free-standing on two legs, `stand` high, where there is no wall to hang it on.
  if (stand > 0) {
    for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
      const leg = rbox(0.08, stand, 0.08, mat('#2b2e38'), -stand, 0.03)
      leg.position.set(x, leg.position.y, -0.08)
      g.add(leg)
      const foot = rbox(0.12, 0.05, 0.6, mat('#2b2e38'), -stand, 0.02)
      foot.position.set(x, foot.position.y, -0.08)
      g.add(foot)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = res
  canvas.height = Math.round((res * h) / w)
  const texture = canvasTexture(canvas)
  const material = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 1, roughness: 0.35 })
  const face = mesh(new THREE.PlaneGeometry(w, h), material, false)
  face.position.set(0, h / 2, 0.06)
  g.add(face)
  return { group: g, face, material, canvas, texture }
}


// ---------------------------------------------------------------- people

export type Figure = {
  group: THREE.Group
  /** Everything above the floor: lowered, with the legs swung forward, to sit. */
  rig: THREE.Group
  legs: [THREE.Object3D, THREE.Object3D]
  arms: [THREE.Object3D, THREE.Object3D]
  body: THREE.Object3D
  head: THREE.Object3D
  /** A floating tablet a standing subagent works on. */
  tablet: THREE.Object3D | null
}

const SKIN = ['#f4d2b8', '#e8b896', '#c98e68', '#a26b48', '#7a4b31', '#f1c7a5']
const HAIR = ['#2b1d16', '#4a2f20', '#7a4a2a', '#c58b4a', '#e2c27a', '#1d1b20', '#8f3f2f', '#5b5f6b']
const TROUSERS = ['#3a4256', '#2f3443', '#56606f', '#47392f', '#30485a']
const DEV_SHIRTS = ['#4f7cc9', '#3f9b8f', '#5a6bd6', '#2f8f6b', '#4b5d78', '#3478a8']
const DESIGN_SHIRTS = ['#e0739a', '#f0a04b', '#b46cd9', '#e85f5c', '#f2c94c', '#ef8bb8']

export type Role = 'developer' | 'designer'

/**
 * A chibi person: short body, a big head with a painted face and one of five haircuts. Developers
 * wear headphones and cool colours; designers wear a beret and warm colours. Subagents are a
 * little smaller and carry a floating tablet.
 */
export function figure(opts: { seed: number; role: Role; sub?: boolean }): Figure {
  const rand = seeded(opts.seed * 31 + 7)
  const g = new THREE.Group()
  const rig = new THREE.Group()
  g.add(rig)
  const skinColor = SKIN[Math.floor(rand() * SKIN.length)]!
  const skin = mat(skinColor, { roughness: 0.7 })
  const hairColor = HAIR[Math.floor(rand() * HAIR.length)]!
  const hair = mat(hairColor, { roughness: 0.9 })
  const shirts = opts.role === 'designer' ? DESIGN_SHIRTS : DEV_SHIRTS
  const shirt = mat(shirts[Math.floor(rand() * shirts.length)]!, { roughness: 0.9 })
  const trousers = mat(TROUSERS[Math.floor(rand() * TROUSERS.length)]!, { roughness: 0.9 })
  const shoes = mat('#f4f4f2', { roughness: 0.7 })
  const ink = mat('#1d1b20', { roughness: 0.6 })

  const legs = pair((side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.13, 0.46, 0)
    pivot.add(rbox(0.2, 0.36, 0.22, trousers, -0.4, 0.07))
    const shoe = mesh(roundGeo(0.24, 0.13, 0.32, 0.06), shoes)
    shoe.position.set(0, -0.41, 0.04)
    pivot.add(shoe)
    rig.add(pivot)
    return pivot
  })

  const body = new THREE.Group()
  body.position.y = 0.45
  rig.add(body)
  body.add(rbox(0.6, 0.5, 0.42, shirt, 0, 0.16))
  if (opts.role === 'developer') {
    // A hoodie's drawstrings.
    for (const side of [-1, 1]) {
      const s = mesh(roundGeo(0.025, 0.16, 0.02, 0.01), mat('#f4f4f2'), false)
      s.position.set(side * 0.07, 0.34, 0.215)
      body.add(s)
    }
  } else {
    const scarf = mesh(geo('scarf', () => new THREE.TorusGeometry(0.2, 0.06, 8, 18)), mat('#f7f2e6', { roughness: 1 }))
    scarf.rotation.x = Math.PI / 2
    scarf.position.y = 0.5
    body.add(scarf)
  }

  const arms = pair((side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.34, 0.92, 0)
    const sleeve = mesh(roundGeo(0.17, 0.2, 0.19, 0.07), shirt)
    sleeve.position.y = -0.08
    pivot.add(sleeve)
    const arm = mesh(roundGeo(0.13, 0.24, 0.14, 0.06), skin)
    arm.position.y = -0.24
    pivot.add(arm)
    const hand = mesh(geo('hand', () => new THREE.SphereGeometry(0.085, 12, 10)), skin)
    hand.position.y = -0.38
    pivot.add(hand)
    pivot.rotation.z = side * 0.12
    rig.add(pivot)
    return pivot
  })

  const head = new THREE.Group()
  head.position.y = 1.36
  rig.add(head)
  const skull = mesh(geo('skull', () => new THREE.SphereGeometry(0.42, 28, 22)), skin)
  skull.scale.set(1, 0.94, 0.92)
  head.add(skull)
  for (const side of [-1, 1]) {
    const ear = mesh(geo('ear', () => new THREE.SphereGeometry(0.08, 10, 8)), skin, false)
    ear.position.set(side * 0.41, -0.02, 0)
    ear.scale.set(0.6, 1, 0.8)
    head.add(ear)
    const eye = mesh(geo('eye', () => new THREE.SphereGeometry(0.05, 12, 10)), ink, false)
    eye.scale.set(0.8, 1.25, 0.5)
    eye.position.set(side * 0.14, 0.02, 0.37)
    head.add(eye)
    const brow = mesh(roundGeo(0.15, 0.035, 0.03, 0.015), mat(hairColor), false)
    brow.position.set(side * 0.15, 0.14, 0.37)
    brow.rotation.z = side * -(0.08 + rand() * 0.18)
    head.add(brow)
    const cheek = mesh(geo('cheek', () => new THREE.SphereGeometry(0.05, 10, 8)), mat('#f09a8a', { transparent: true, opacity: 0.45 }), false)
    cheek.scale.set(1, 0.6, 0.3)
    cheek.position.set(side * 0.23, -0.08, 0.34)
    head.add(cheek)
  }
  const nose = mesh(geo('nose', () => new THREE.SphereGeometry(0.045, 10, 8)), mat(new THREE.Color(skinColor).multiplyScalar(0.92).getStyle()), false)
  nose.position.set(0, -0.05, 0.4)
  head.add(nose)
  const mouth = mesh(roundGeo(0.1, 0.02, 0.02, 0.009), ink, false)
  mouth.position.set(0, -0.16, 0.37)
  head.add(mouth)
  head.add(haircut(Math.floor(rand() * 5), hair, rand))

  if (opts.role === 'developer') {
    // Headphones: a band over the top and a cup on each ear.
    const dark = mat('#2a2d36', { roughness: 0.5 })
    const band = mesh(geo('band', () => new THREE.TorusGeometry(0.46, 0.035, 8, 24, Math.PI)), dark, false)
    band.position.y = 0.02
    head.add(band)
    for (const side of [-1, 1]) {
      const cup = mesh(geo('cup', () => new THREE.CylinderGeometry(0.11, 0.11, 0.09, 16)), mat(rand() > 0.5 ? '#e85f5c' : '#2a2d36', { roughness: 0.5 }), false)
      cup.rotation.z = Math.PI / 2
      cup.position.set(side * 0.45, -0.02, 0)
      head.add(cup)
    }
  } else {
    const beret = mesh(geo('beret', () => new THREE.SphereGeometry(0.4, 20, 12)), mat(['#c83d4a', '#2f3443', '#6b4f7a'][Math.floor(rand() * 3)]!, { roughness: 1 }))
    beret.scale.set(1.05, 0.32, 1.05)
    beret.position.set(0.04, 0.38, -0.02)
    beret.rotation.z = -0.25
    head.add(beret)
    const nub = mesh(geo('nub', () => new THREE.SphereGeometry(0.04, 8, 6)), beret.material as THREE.Material, false)
    nub.position.set(0.08, 0.52, -0.02)
    head.add(nub)
  }

  // Glasses for about one in five.
  if (rand() < 0.2) {
    const frame = mat('#2c2f38')
    for (const side of [-1, 1]) {
      const lens = mesh(geo('lens', () => new THREE.TorusGeometry(0.075, 0.012, 6, 18)), frame, false)
      lens.position.set(side * 0.14, 0.02, 0.39)
      head.add(lens)
    }
  }

  let tablet: THREE.Object3D | null = null
  if (opts.sub) {
    const t = new THREE.Group()
    t.add(rbox(0.46, 0.03, 0.32, mat('#22252d'), 0, 0.02))
    const glow = mesh(boxGeo(0.42, 0.005, 0.28), mat('#0c1a2e', { emissive: '#7fd6ff', emissiveIntensity: 1.2 }), false)
    glow.position.y = 0.033
    t.add(glow)
    t.position.set(0, 0.95, 0.42)
    t.rotation.x = -0.5
    rig.add(t)
    tablet = t
    g.scale.setScalar(0.78)
  }

  return { group: g, rig, legs, arms, body, head, tablet }
}

function pair(make: (side: number) => THREE.Object3D): [THREE.Object3D, THREE.Object3D] {
  return [make(-1), make(1)]
}

/** Five haircuts: a short crop, a long bob, a bun, curls and a side-swept fringe. */
function haircut(style: number, hair: THREE.Material, rand: () => number) {
  const g = new THREE.Group()
  const cap = (scale: number, y: number, theta: number) => {
    const m = mesh(geo(`cap:${r2(theta)}`, () => new THREE.SphereGeometry(0.44, 24, 16, 0, Math.PI * 2, 0, theta)), hair)
    m.scale.set(scale, scale * 0.95, scale * 0.94)
    m.position.y = y
    m.rotation.x = -0.35
    g.add(m)
  }
  switch (style) {
    case 0:
      cap(1.02, 0.02, Math.PI * 0.42)
      break
    case 1: {
      cap(1.05, 0.02, Math.PI * 0.5)
      const back = mesh(roundGeo(0.86, 0.6, 0.4, 0.18), hair)
      back.position.set(0, -0.14, -0.16)
      g.add(back)
      break
    }
    case 2: {
      cap(1.03, 0.02, Math.PI * 0.45)
      const bun = mesh(geo('bun', () => new THREE.SphereGeometry(0.16, 14, 10)), hair)
      bun.position.set(0, 0.36, -0.26)
      g.add(bun)
      break
    }
    case 3: {
      for (let i = 0; i < 14; i++) {
        const curl = mesh(geo('curl', () => new THREE.IcosahedronGeometry(0.16, 1)), hair)
        const a = (i / 14) * Math.PI * 2
        curl.position.set(Math.cos(a) * 0.32, 0.18 + rand() * 0.2, Math.sin(a) * 0.3 - 0.06)
        g.add(curl)
      }
      cap(1.06, 0.06, Math.PI * 0.4)
      break
    }
    default: {
      cap(1.03, 0.02, Math.PI * 0.44)
      const fringe = mesh(roundGeo(0.5, 0.14, 0.2, 0.07), hair)
      fringe.position.set(0.08, 0.28, 0.27)
      fringe.rotation.set(0.5, 0, -0.35)
      g.add(fringe)
    }
  }
  return g
}

// ---------------------------------------------------------------- summoning

/** The rune circle drawn under someone being summoned. Its material is the summon's own, to fade; the texture is shared. */
export function runeCircle(color: string) {
  let map = runes.get(color)
  if (!map) {
    map = canvasTexture(runeCanvas(color))
    runes.set(color, map)
  }
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const m = new THREE.Mesh(geo('rune', () => new THREE.PlaneGeometry(2.2, 2.2)), material)
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.08
  return { mesh: m, material }
}

function runeCanvas(color: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const x = c.getContext('2d')!
  x.translate(256, 256)
  x.strokeStyle = color
  x.fillStyle = color
  x.shadowColor = color
  x.shadowBlur = 18
  x.lineWidth = 8
  for (const r of [236, 196]) {
    x.beginPath()
    x.arc(0, 0, r, 0, Math.PI * 2)
    x.stroke()
  }
  x.lineWidth = 5
  // Two overlapping triangles make a six-pointed star.
  for (const off of [0, Math.PI / 3]) {
    x.beginPath()
    for (let i = 0; i <= 3; i++) {
      const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2
      const px = Math.cos(a) * 190, py = Math.sin(a) * 190
      if (i) x.lineTo(px, py)
      else x.moveTo(px, py)
    }
    x.stroke()
  }
  x.font = `700 26px ${FONT}`
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  const glyphs = '{ } < / > ; = ( ) [ ] # $ & * + ~ %'.split(' ')
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    x.save()
    x.rotate(a)
    x.fillText(glyphs[i % glyphs.length]!, 0, -216)
    x.restore()
  }
  return c
}

let pillarTexture: THREE.CanvasTexture | null = null

/** A column of light rising from the rune circle: a white fade, tinted by its material. */
export function lightPillar(color: string) {
  if (!pillarTexture) {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 128
    const x = c.getContext('2d')!
    const g = x.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,1)')
    x.fillStyle = g
    x.fillRect(0, 0, 4, 128)
    pillarTexture = canvasTexture(c)
  }
  const material = new THREE.MeshBasicMaterial({ color, map: pillarTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  const m = new THREE.Mesh(geo('pillar', () => new THREE.CylinderGeometry(0.75, 0.9, 4, 28, 1, true)), material)
  m.position.y = 2
  return { mesh: m, material }
}

let sparkTexture: THREE.CanvasTexture | null = null

/** A soft round dot for sparkle particles. */
export function spark() {
  if (sparkTexture) return sparkTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 64, 64)
  sparkTexture = canvasTexture(c)
  return sparkTexture
}

// ---------------------------------------------------------------- the open-plan look

export const LOW_H = 1.05

/** A low partition in a room's colour with a white cap: rooms stay open to the floor around them. */
export function lowWall(a: THREE.Vector2, b: THREE.Vector2, color: string) {
  const g = new THREE.Group()
  const length = a.distanceTo(b)
  if (length < 0.1) return g
  g.add(rbox(length, LOW_H, 0.2, mat(color, { roughness: 0.85 }), 0, 0.08))
  g.add(rbox(length + 0.04, 0.07, 0.28, mat(WHITE, { roughness: 0.6 }), LOW_H, 0.03))
  return along(g, a, b)
}

/** The arch over a room's door: two posts and the room's sign on top. */
export function doorArch(name: string, color: string) {
  const g = new THREE.Group()
  const post = mat(WHITE, { roughness: 0.6 })
  for (const x of [-1, 1]) {
    const p = rbox(0.16, 2.3, 0.2, post, 0, 0.06)
    p.position.x = x
    g.add(p)
  }
  const sign = doorSign(name, color)
  sign.scale.setScalar(1.1)
  sign.position.y = 2.55
  sign.rotation.x = -0.3
  g.add(sign)
  return g
}

/** A floor lamp; `glow` is the room's own shade material, lit or not. */
export function floorLamp(glow: THREE.Material) {
  const g = new THREE.Group()
  const metal = mat('#3a3d48', { roughness: 0.4, metalness: 0.3 })
  const base = mesh(geo('lamp-base', () => new THREE.CylinderGeometry(0.22, 0.26, 0.05, 18)), metal)
  base.position.y = 0.025
  g.add(base)
  const pole = mesh(geo('lamp-pole', () => new THREE.CylinderGeometry(0.025, 0.025, 1.6, 8)), metal)
  pole.position.y = 0.8
  g.add(pole)
  const shade = mesh(geo('lamp-shade', () => new THREE.CylinderGeometry(0.2, 0.3, 0.36, 18, 1, true)), glow)
  shade.position.y = 1.7
  g.add(shade)
  return g
}

/** A two-seat sofa facing +z. */
export function sofa(color: string) {
  const g = new THREE.Group()
  const fabric = mat(color, { roughness: 0.95 })
  g.add(rbox(1.9, 0.42, 0.85, fabric, 0.05, 0.14))
  const back = rbox(1.9, 0.55, 0.24, fabric, 0.4, 0.12)
  back.position.z = -0.33
  g.add(back)
  for (const x of [-1, 1]) {
    const arm = rbox(0.24, 0.32, 0.85, fabric, 0.4, 0.1)
    arm.position.x = x * 0.95
    g.add(arm)
  }
  for (const x of [-0.45, 0.45]) {
    const cushion = rbox(0.8, 0.12, 0.6, mat(tint(color, 0.15), { roughness: 1 }), 0.46, 0.06)
    cushion.position.set(x, cushion.position.y, 0.06)
    g.add(cushion)
  }
  return g
}

/** A squashy bean bag. */
export function beanBag(color: string) {
  const m = mesh(geo('beanbag', () => new THREE.SphereGeometry(0.5, 20, 14)), mat(color, { roughness: 1 }))
  m.scale.set(1, 0.6, 1)
  m.position.y = 0.28
  const g = new THREE.Group()
  g.add(m)
  return g
}

/** The games console: a white tower with a black core, on a low TV bench. */
export function consoleBench() {
  const g = new THREE.Group()
  g.add(rbox(2.4, 0.4, 0.5, mat(WOOD, { roughness: 0.7 }), 0, 0.05))
  const ps = new THREE.Group()
  ps.add(rbox(0.1, 0.42, 0.32, mat('#1a1b20'), 0, 0.03))
  for (const x of [-0.07, 0.07]) {
    const side = rbox(0.05, 0.46, 0.36, mat('#f7f7f8', { roughness: 0.4 }), 0, 0.04)
    side.position.x = x
    ps.add(side)
  }
  const light = mesh(boxGeo(0.02, 0.4, 0.01), mat('#3c7dff', { emissive: '#3c7dff', emissiveIntensity: 2 }), false)
  light.position.set(0, 0.22, 0.19)
  ps.add(light)
  ps.position.set(0.8, 0.4, 0)
  g.add(ps)
  return g
}

/** A game controller, held in both hands while playing. */
export function controller() {
  const g = new THREE.Group()
  g.add(rbox(0.3, 0.06, 0.14, mat('#f7f7f8', { roughness: 0.4 }), 0, 0.03))
  const pad = rbox(0.12, 0.065, 0.08, mat('#1a1b20'), 0, 0.02)
  pad.position.z = 0.01
  g.add(pad)
  return g
}

/** A ping pong table along x, with its net. */
export function pingPong() {
  const g = new THREE.Group()
  g.add(rbox(2.74, 0.06, 1.52, mat('#2f6fb3', { roughness: 0.6 }), 0.7, 0.02))
  const mid = mesh(boxGeo(2.7, 0.005, 0.02), mat('#ffffff'), false)
  mid.position.y = 0.763
  g.add(mid)
  const net = mesh(boxGeo(0.02, 0.16, 1.6), mat('#f2f2f2', { transparent: true, opacity: 0.85 }), false)
  net.position.y = 0.84
  g.add(net)
  for (const x of [-1.1, 1.1]) {
    for (const z of [-0.6, 0.6]) {
      const leg = rbox(0.06, 0.7, 0.06, mat('#2b2e38'), 0, 0.02)
      leg.position.set(x, leg.position.y, z)
      g.add(leg)
    }
  }
  return g
}

/** A foosball table along x: the rods and little players. */
export function foosball() {
  const g = new THREE.Group()
  g.add(rbox(1.3, 0.3, 0.75, mat('#7a5233', { roughness: 0.7 }), 0.62, 0.04))
  const pitch = mesh(boxGeo(1.18, 0.01, 0.64), mat('#3f9b55'), false)
  pitch.position.y = 0.93
  g.add(pitch)
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.3, 0.3]) {
      const leg = rbox(0.08, 0.62, 0.08, mat('#5a3d27'), 0, 0.02)
      leg.position.set(x, leg.position.y, z)
      g.add(leg)
    }
  }
  const rod = mat('#cfd3da', { metalness: 0.6, roughness: 0.3 })
  ;[-0.45, -0.15, 0.15, 0.45].forEach((x, i) => {
    const r = mesh(geo('foos-rod', () => new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6)), rod, false)
    r.rotation.x = Math.PI / 2
    r.position.set(x, 1.0, 0)
    g.add(r)
    for (const z of [-0.18, 0, 0.18]) {
      const man = rbox(0.05, 0.12, 0.04, mat(i % 2 ? '#e85f5c' : '#4f7cc9'), 0.92, 0.015)
      man.position.set(x, man.position.y, z)
      g.add(man)
    }
  })
  return g
}

/** An arcade cabinet facing +z; `screen` is its glowing material. */
export function arcade(screen: THREE.Material) {
  const g = new THREE.Group()
  g.add(rbox(0.8, 1.9, 0.7, mat('#6b4f7a', { roughness: 0.6 }), 0, 0.05))
  const face = mesh(boxGeo(0.62, 0.5, 0.02), screen, false)
  face.position.set(0, 1.4, 0.36)
  face.rotation.x = -0.15
  g.add(face)
  const desk = rbox(0.8, 0.08, 0.35, mat('#2b2e38'), 0.95, 0.03)
  desk.position.z = 0.42
  g.add(desk)
  const stick = mesh(geo('stick', () => new THREE.SphereGeometry(0.04, 10, 8)), mat('#e85f5c'), false)
  stick.position.set(-0.15, 1.08, 0.45)
  g.add(stick)
  ;['#f2c94c', '#4f7cc9', '#4cc38a'].forEach((c, i) => {
    const b = mesh(geo('btn', () => new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10)), mat(c), false)
    b.position.set(0.05 + i * 0.09, 1.04, 0.45)
    g.add(b)
  })
  const marquee = mesh(boxGeo(0.7, 0.18, 0.04), mat('#f2c94c', { emissive: '#f2a93c', emissiveIntensity: 0.9 }), false)
  marquee.position.set(0, 1.8, 0.36)
  g.add(marquee)
  return g
}

/** A pool table along x: green felt in wooden rails, six pockets and the balls racked up. */
export function poolTable() {
  const g = new THREE.Group()
  const wood = mat('#6e4529', { roughness: 0.6 })
  g.add(rbox(2.3, 0.2, 1.25, wood, 0.6, 0.05))
  const felt = mesh(boxGeo(2.05, 0.02, 1.0), mat('#2f8a57', { roughness: 1 }), false)
  felt.position.y = 0.81
  g.add(felt)
  for (const z of [-0.56, 0.56]) {
    const rail = rbox(2.3, 0.07, 0.13, wood, 0.8, 0.03)
    rail.position.z = z
    g.add(rail)
  }
  for (const x of [-1.09, 1.09]) {
    const rail = rbox(0.13, 0.07, 1.25, wood, 0.8, 0.03)
    rail.position.x = x
    g.add(rail)
  }
  const pocket = mat('#141519')
  for (const x of [-1.0, 0, 1.0]) {
    for (const z of [-0.47, 0.47]) {
      const p = mesh(geo('pool-pocket', () => new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12)), pocket, false)
      p.position.set(x, 0.825, z)
      g.add(p)
    }
  }
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.45, 0.45]) {
      const leg = rbox(0.14, 0.6, 0.14, wood, 0, 0.03)
      leg.position.set(x * 1.4, leg.position.y, z)
      g.add(leg)
    }
  }
  // The rack, a triangle of five rows pointing at the cue ball.
  const colors = ['#f2c94c', '#4f7cc9', '#e85f5c', '#8a5bd6', '#f08a3c', '#3f9b55', '#8a2d2d', '#141519']
  const ball = geo('pool-ball', () => new THREE.SphereGeometry(0.035, 12, 10))
  let n = 0
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      const b = mesh(ball, mat(colors[n++ % colors.length]!, { roughness: 0.3 }), false)
      b.position.set(0.45 + row * 0.062, 0.855, (i - row / 2) * 0.072)
      g.add(b)
    }
  }
  const cue = mesh(ball, mat('#f7f7f8', { roughness: 0.3 }), false)
  cue.position.set(-0.5, 0.855, 0)
  g.add(cue)
  return g
}

/** A pool cue, held in both hands along the arms. */
export function cue() {
  const g = new THREE.Group()
  const shaft = mesh(geo('cue', () => new THREE.CylinderGeometry(0.008, 0.016, 1.3, 8)), mat('#d9b48a', { roughness: 0.5 }), false)
  shaft.rotation.x = Math.PI / 2
  g.add(shaft)
  return g
}

/**
 * An air hockey table along x: a white deck in blue rails with a goal at each end. `puck` and the
 * two `mallets` (at -x and +x) are left loose for the scene to slide about.
 */
export function airHockey() {
  const g = new THREE.Group()
  g.add(rbox(2.0, 0.22, 1.05, mat('#2f4fa8', { roughness: 0.5 }), 0.58, 0.05))
  const deck = mesh(boxGeo(1.84, 0.01, 0.9), mat('#f2f4f8', { roughness: 0.2 }), false)
  deck.position.y = 0.805
  g.add(deck)
  const line = mat('#e85f5c')
  const mid = mesh(boxGeo(0.015, 0.003, 0.9), line, false)
  mid.position.y = 0.812
  g.add(mid)
  for (const x of [-0.93, 0.93]) {
    const goal = mesh(boxGeo(0.02, 0.04, 0.32), mat('#141519'), false)
    goal.position.set(x, 0.82, 0)
    g.add(goal)
  }
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.4, 0.4]) {
      const leg = rbox(0.1, 0.58, 0.1, mat('#2b2e38'), 0, 0.02)
      leg.position.set(x, leg.position.y, z)
      g.add(leg)
    }
  }
  const puck = mesh(geo('puck', () => new THREE.CylinderGeometry(0.05, 0.05, 0.015, 14)), mat('#e85f5c', { emissive: '#e85f5c', emissiveIntensity: 0.3 }), false)
  puck.position.y = 0.818
  g.add(puck)
  const mallets = ['#f2c94c', '#4cc38a'].map((c, i) => {
    const m = new THREE.Group()
    m.add(mesh(geo('mallet', () => new THREE.CylinderGeometry(0.07, 0.07, 0.03, 14)), mat(c), false))
    const knob = mesh(geo('mallet-knob', () => new THREE.CylinderGeometry(0.025, 0.03, 0.06, 10)), mat(c), false)
    knob.position.y = 0.04
    m.add(knob)
    m.position.set(i ? 0.75 : -0.75, 0.825, 0)
    g.add(m)
    return m
  })
  return { group: g, puck, mallets }
}

/** A round table set for a board game, with a stool on each of its four sides. */
export function boardGame() {
  const g = new THREE.Group()
  const wood = mat(WOOD, { roughness: 0.7 })
  const top = mesh(geo('board-top', () => new THREE.CylinderGeometry(0.6, 0.6, 0.06, 28)), wood)
  top.position.y = 0.72
  g.add(top)
  const stem = mesh(geo('board-stem', () => new THREE.CylinderGeometry(0.06, 0.06, 0.7, 10)), mat('#5a3d27'), false)
  stem.position.y = 0.36
  g.add(stem)
  const foot = mesh(geo('board-foot', () => new THREE.CylinderGeometry(0.3, 0.32, 0.04, 20)), mat('#5a3d27'))
  foot.position.y = 0.02
  g.add(foot)
  // The board, a checkerboard painted in two tones, with a few pieces out.
  const board = rbox(0.62, 0.025, 0.62, mat('#f7f2e6', { roughness: 0.8 }), 0.75, 0.01)
  g.add(board)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2) continue
      const sq = mesh(boxGeo(0.14, 0.004, 0.14), mat('#8a5bd6', { roughness: 0.8 }), false)
      sq.position.set(-0.225 + i * 0.15, 0.777, -0.225 + j * 0.15)
      g.add(sq)
    }
  }
  ;[[-0.22, -0.08, '#e85f5c'], [0.08, 0.22, '#e85f5c'], [0.22, -0.22, '#4f7cc9'], [-0.08, 0.08, '#4f7cc9'], [0.08, -0.08, '#f2c94c']].forEach(([x, z, c]) => {
    const piece = mesh(geo('board-piece', () => new THREE.CylinderGeometry(0.035, 0.045, 0.09, 10)), mat(c as string), false)
    piece.position.set(x as number, 0.82, z as number)
    g.add(piece)
  })
  const seat = mat('#e98a5b', { roughness: 0.9 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const stool = new THREE.Group()
    stool.add(rbox(0.38, 0.1, 0.38, seat, 0.44, 0.05))
    const leg = mesh(geo('stool-leg', () => new THREE.CylinderGeometry(0.04, 0.05, 0.44, 8)), mat('#4a4f5a', { metalness: 0.3, roughness: 0.4 }), false)
    leg.position.y = 0.22
    stool.add(leg)
    stool.position.set(Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95)
    g.add(stool)
  }
  return g
}

/** A dartboard on a stand, facing +z, with a throwing line painted `line` in front of it. */
export function dartboard(line: number) {
  const g = new THREE.Group()
  const post = mat('#3a3d48', { roughness: 0.5 })
  g.add(rbox(0.7, 0.05, 0.45, post, 0, 0.02))
  const pole = rbox(0.08, 1.9, 0.08, post, 0, 0.02)
  pole.position.z = -0.12
  g.add(pole)
  const back = rbox(0.95, 0.95, 0.06, mat('#2b2e38', { roughness: 0.9 }), 1.25, 0.04)
  back.position.z = -0.06
  g.add(back)
  ;[['#141519', 0.36], ['#e85f5c', 0.3], ['#f7f2e6', 0.26], ['#3f9b55', 0.16], ['#141519', 0.12], ['#e85f5c', 0.04]].forEach(([c, r], i) => {
    const ring = mesh(geo(`dart-ring:${r}`, () => new THREE.CylinderGeometry(r as number, r as number, 0.02, 28)), mat(c as string, { roughness: 0.8 }), false)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 1.72, -0.01 + i * 0.004)
    g.add(ring)
  })
  for (const [x, y] of [[0.08, 0.06], [-0.12, -0.04], [0.02, -0.15]]) {
    const dart = mesh(geo('dart', () => new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6)), mat('#f2c94c'), false)
    dart.rotation.x = Math.PI / 2
    dart.position.set(x!, 1.72 + y!, 0.07)
    g.add(dart)
  }
  const oche = mesh(boxGeo(0.9, 0.006, 0.05), mat('#f2c94c', { roughness: 0.6 }), false)
  oche.position.set(0, 0.004, line)
  g.add(oche)
  return g
}

/** The coffee bar: a counter with an espresso machine and a row of mugs, facing +z. */
export function coffeeBar() {
  const g = new THREE.Group()
  g.add(rbox(2.4, 1.0, 0.7, mat('#3f6b70', { roughness: 0.7 }), 0, 0.05))
  g.add(rbox(2.5, 0.06, 0.8, mat(WOOD, { roughness: 0.6 }), 1.0, 0.03))
  const machine = new THREE.Group()
  machine.add(rbox(0.5, 0.45, 0.4, mat('#cfd3da', { metalness: 0.5, roughness: 0.3 }), 0, 0.05))
  const red = mesh(boxGeo(0.12, 0.04, 0.02), mat('#e85f5c', { emissive: '#e85f5c', emissiveIntensity: 1 }), false)
  red.position.set(0.12, 0.36, 0.21)
  machine.add(red)
  machine.position.set(-0.7, 1.06, -0.05)
  g.add(machine)
  ;['#e98a5b', '#ffffff', '#8fb7a0', '#f2c94c'].forEach((c, i) => {
    const mug = mesh(geo('mug', () => new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10)), mat(c))
    mug.position.set(0.1 + i * 0.22, 1.11, 0.1)
    g.add(mug)
  })
  return g
}

/** Strings of coloured bulbs hung between posts at the given corners, round the loop. */
export function stringLights(corners: THREE.Vector2[], height = 3.2) {
  const g = new THREE.Group()
  const post = mat('#3a3d48', { roughness: 0.5 })
  const colors = ['#ffd27a', '#ff8fb1', '#8fd6ff', '#b6f28c', '#ffb36b']
  const bulbs = colors.map(c => mat(c, { emissive: c, emissiveIntensity: 1.6 }))
  const wire = new THREE.LineBasicMaterial({ color: '#2b2b30' })
  corners.forEach((a, i) => {
    const p = rbox(0.1, height + 0.2, 0.1, post, 0, 0.03)
    p.position.set(a.x, p.position.y, a.y)
    g.add(p)
    const b = corners[(i + 1) % corners.length]!
    const pts: THREE.Vector3[] = []
    const n = Math.max(6, Math.round(a.distanceTo(b) / 0.7))
    for (let k = 0; k <= n; k++) {
      const f = k / n
      // A gentle sag between the posts.
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * f, height - Math.sin(f * Math.PI) * 0.45, a.y + (b.y - a.y) * f))
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire))
    pts.forEach((pt, k) => {
      if (k === 0 || k === n) return
      const bulb = mesh(geo('bulb-s', () => new THREE.SphereGeometry(0.06, 8, 6)), bulbs[(i * 7 + k) % bulbs.length]!, false)
      bulb.position.set(pt.x, pt.y - 0.08, pt.z)
      g.add(bulb)
    })
  })
  return g
}

// ---------------------------------------------------------------- the stage

/** A guitar held across the body, neck to the player's left; a bass has a longer neck. */
export function guitar(color: string, bass = false) {
  const g = new THREE.Group()
  const finish = mat(color, { roughness: 0.35, metalness: 0.1 })
  const lower = mesh(geo('gtr-lower', () => new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20)), finish, false)
  lower.rotation.x = Math.PI / 2
  lower.scale.set(1.1, 1, 1)
  g.add(lower)
  const upper = mesh(geo('gtr-upper', () => new THREE.CylinderGeometry(0.15, 0.15, 0.08, 20)), finish, false)
  upper.rotation.x = Math.PI / 2
  upper.position.x = 0.2
  g.add(upper)
  const guard = mesh(boxGeo(0.14, 0.12, 0.01), mat('#f4f1ec'), false)
  guard.position.set(-0.04, -0.04, 0.045)
  g.add(guard)
  const len = bass ? 0.85 : 0.66
  const neck = mesh(boxGeo(len, 0.06, 0.04), mat('#5a3d27', { roughness: 0.6 }), false)
  neck.position.x = 0.3 + len / 2
  g.add(neck)
  const head = mesh(boxGeo(0.14, 0.09, 0.04), mat('#1d1b20'), false)
  head.position.x = 0.3 + len + 0.07
  g.add(head)
  g.rotation.z = 0.42
  return g
}

/** A drum kit facing +z: kick, snare, two toms, a hi-hat, a crash and the stool behind it all. */
export function drumKit() {
  const g = new THREE.Group()
  const shell = mat('#c83d4a', { roughness: 0.35, metalness: 0.2 })
  const skin = mat('#f4f1ec', { roughness: 0.8 })
  const brass = mat('#e2b04a', { roughness: 0.3, metalness: 0.8 })
  const chrome = mat('#cfd3da', { roughness: 0.3, metalness: 0.7 })
  const stand = (x: number, y: number, z: number) => {
    const s = mesh(geo('drum-stand', () => new THREE.CylinderGeometry(0.015, 0.015, 1, 6)), chrome, false)
    s.scale.y = y
    s.position.set(x, y / 2, z)
    g.add(s)
  }
  const kick = mesh(geo('kick', () => new THREE.CylinderGeometry(0.36, 0.36, 0.34, 24)), shell)
  kick.rotation.x = Math.PI / 2
  kick.position.set(0, 0.36, 0.25)
  g.add(kick)
  const face = mesh(geo('kick-head', () => new THREE.CircleGeometry(0.33, 24)), skin, false)
  face.position.set(0, 0.36, 0.425)
  g.add(face)
  const drum = (r: number, h: number, x: number, y: number, z: number, tilt: number) => {
    const d = mesh(geo(`drum:${r}:${h}`, () => new THREE.CylinderGeometry(r, r, h, 20)), shell)
    d.position.set(x, y, z)
    d.rotation.x = tilt
    g.add(d)
    const top = mesh(geo(`drum-top:${r}`, () => new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.01, 20)), skin, false)
    top.position.y = h / 2
    d.add(top)
    stand(x, y, z)
  }
  drum(0.17, 0.14, 0.32, 0.62, -0.05, 0.25)
  drum(0.14, 0.16, -0.16, 0.86, 0.12, 0.45)
  drum(0.14, 0.16, 0.16, 0.86, 0.12, 0.45)
  const cymbal = (r: number, x: number, y: number, z: number) => {
    const c = mesh(geo(`cymbal:${r}`, () => new THREE.CylinderGeometry(r, r * 0.2, 0.025, 24)), brass, false)
    c.position.set(x, y, z)
    c.rotation.x = 0.25
    g.add(c)
    stand(x, y, z)
    return c
  }
  const hat = cymbal(0.17, -0.48, 0.85, -0.05)
  const crash = cymbal(0.24, 0.55, 1.2, 0.2)
  const stool = mesh(geo('stool', () => new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16)), mat('#1d1b20'))
  stool.position.set(0, 0.46, -0.55)
  g.add(stool)
  stand(0, 0.42, -0.55)
  return { group: g, hat, crash }
}

/** A drumstick for a hand, pointing forwards from a figure's arm pivot. */
export function drumstick() {
  const s = mesh(geo('drumstick', () => new THREE.CylinderGeometry(0.012, 0.018, 0.42, 6)), mat('#e8d3a8'), false)
  s.rotation.x = Math.PI / 2
  s.position.set(0, -0.4, 0.18)
  return s
}

/** A microphone on a stand facing +z, its mic tilted back towards whoever sings into it from behind. */
export function micStand() {
  const g = new THREE.Group()
  const dark = mat('#2b2e38', { roughness: 0.4, metalness: 0.5 })
  const base = mesh(geo('mic-base', () => new THREE.CylinderGeometry(0.18, 0.2, 0.03, 16)), dark)
  base.position.y = 0.015
  g.add(base)
  const pole = mesh(geo('mic-pole', () => new THREE.CylinderGeometry(0.015, 0.015, 1.45, 6)), dark, false)
  pole.position.y = 0.72
  g.add(pole)
  const mic = mesh(geo('mic', () => new THREE.CapsuleGeometry(0.035, 0.1, 4, 10)), mat('#cfd3da', { metalness: 0.6, roughness: 0.4 }), false)
  mic.position.set(0, 1.5, -0.06)
  mic.rotation.x = -1.1
  g.add(mic)
  return g
}

/** A guitar amp or PA speaker: a black cabinet with its cones, facing +z. */
export function speaker(w = 0.8, h = 1, cones = 2) {
  const g = new THREE.Group()
  g.add(rbox(w, h, 0.5, mat('#1d1b20', { roughness: 0.8 }), 0, 0.04))
  const grille = mat('#3a3d48', { roughness: 0.9 })
  const r = Math.min(w, h / cones) * 0.36
  for (let i = 0; i < cones; i++) {
    const c = mesh(geo(`cone:${r2(r)}`, () => new THREE.CylinderGeometry(r, r * 0.6, 0.06, 18)), grille, false)
    c.rotation.x = Math.PI / 2
    c.position.set(0, (h / cones) * (i + 0.5), 0.26)
    g.add(c)
  }
  const badge = mesh(boxGeo(w * 0.4, 0.05, 0.01), mat('#e2b04a', { emissive: '#e2b04a', emissiveIntensity: 0.4 }), false)
  badge.position.set(0, h - 0.07, 0.255)
  g.add(badge)
  return g
}

/**
 * A stage `w` x `d` and `h` high facing +z: a dark platform with a neon strip along its front edge
 * and a lighting truss over it. The scene recolours the `beams` and swings the `cans` to the music.
 */
export function stage(w: number, d: number, h: number) {
  const g = new THREE.Group()
  g.add(rbox(w, h, d, mat('#2a2633', { roughness: 0.7 }), 0, 0.04))
  const strip = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ff4fd8', emissiveIntensity: 2 })
  const edge = mesh(boxGeo(w, 0.05, 0.03), strip, false)
  edge.position.set(0, h - 0.06, d / 2 + 0.01)
  g.add(edge)
  // A step up at each end of the front.
  for (const x of [-1, 1]) {
    const step = rbox(0.9, h / 2, 0.5, mat('#3a3545'), 0, 0.03)
    step.position.set(x * (w / 2 - 0.6), step.position.y, d / 2 + 0.25)
    g.add(step)
  }

  const metal = mat('#3a3d48', { roughness: 0.4, metalness: 0.5 })
  const top = 4.2
  for (const x of [-w / 2 - 0.1, w / 2 + 0.1]) {
    for (const z of [-d / 2, d / 2]) {
      const post = rbox(0.14, top, 0.14, metal, 0, 0.03)
      post.position.set(x, post.position.y, z)
      g.add(post)
    }
  }
  for (const z of [-d / 2, d / 2]) {
    const bar = rbox(w + 0.34, 0.14, 0.14, metal, top - 0.14, 0.03)
    bar.position.z = z
    g.add(bar)
  }
  const beams: THREE.MeshBasicMaterial[] = []
  const cans: THREE.Group[] = []
  const n = Math.max(3, Math.round(w / 2))
  for (let i = 0; i < n; i++) {
    const can = new THREE.Group()
    can.position.set(-w / 2 + (w / n) * (i + 0.5), top - 0.2, d / 2)
    const body = mesh(geo('can', () => new THREE.CylinderGeometry(0.12, 0.16, 0.3, 12)), mat('#1d1b20'), false)
    body.position.y = -0.1
    can.add(body)
    const material = new THREE.MeshBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const len = top - h
    const cone = mesh(geo(`beam:${r2(len)}`, () => new THREE.ConeGeometry(0.9, len, 20, 1, true)), material, false)
    cone.position.y = -len / 2 - 0.2
    can.add(cone)
    g.add(can)
    beams.push(material)
    cans.push(can)
  }
  return { group: g, beams, cans, strip }
}

/** An open book, held in both hands while Claude reads files. */
export function book() {
  const g = new THREE.Group()
  const cover = mat('#3f6b70', { roughness: 0.8 })
  const pages = mat('#f7f2e6', { roughness: 1 })
  for (const side of [-1, 1]) {
    const half = new THREE.Group()
    half.add(rbox(0.2, 0.015, 0.28, cover, 0, 0.005))
    const leaf = rbox(0.18, 0.03, 0.26, pages, 0.012, 0.005)
    half.add(leaf)
    half.children.forEach(c => { c.position.x = side * 0.1 })
    half.rotation.z = side * -0.25
    g.add(half)
  }
  return g
}
