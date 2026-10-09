import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { EbEnv, Ec2Instance } from '#shared/aws'
import { bigScreen, carpet, disposeTree, doorArch, FONT, floorText, figure, type Figure, geo, hashOf, lightPillar, lightPool, lowWall, mat, mesh, rbox, tag } from './kit'

/**
 * The AWS data centre: a building of its own on the other side of the office from GitHub HQ, for
 * the profile and region the AWS window is on.
 *
 * The server hall has a rack for each EC2 instance: its lights blink green while it runs, pulse
 * amber while it starts or stops, and are dark when it's stopped. The Beanstalk wing has a tower for
 * each environment, its beacon glowing the environment's health, with a beam of light while a deploy
 * is going. A board on the back wall lists the environments, and a technician walks the floor
 * saying how things are.
 *
 * Picks are `{ kind: 'aws', id }` with ids `ec2:<instance id>`, `eb:<environment>`,
 * `wing:racks|envs` and `dc`.
 */

export interface DcData {
  profile: string
  region: string
  instances: Ec2Instance[]
  envs: EbEnv[]
  /** Still reading AWS for the first time. */
  loading?: boolean
  error?: string
  /** AWS is locked behind its TOTP code. */
  locked?: boolean
}

const WING_D = 12
const ROOMS = [
  { id: 'racks', name: 'Server hall', color: '#ff9900', w: 15 },
  { id: 'envs', name: 'Beanstalk', color: '#2e8b57', w: 9 },
] as const
const INNER = ROOMS.reduce((a, r) => a + r.w, 0)
/** Each room's centre along x, from the group's origin. */
export const DC_WINGS: Record<(typeof ROOMS)[number]['id'], number> = Object.fromEntries(
  ROOMS.map((r, i) => [r.id, -INNER / 2 + ROOMS.slice(0, i).reduce((a, x) => a + x.w, 0) + r.w / 2]),
) as any
/** The whole site: the rooms and the plaza in front, centred on the group's origin along x. */
export const DC_SIZE = { w: INNER + 2, d: WING_D + 6, cz: 2.5 }
/** Where the path from the office meets the plaza, along z from the group's origin. */
export const DC_PATH_Z = WING_D / 2 + 2.6

const HEALTH: Record<string, string> = { Green: '#2da44e', Yellow: '#f2c94c', Red: '#ff4d4f', Grey: '#8c959f' }
const healthOf = (e: EbEnv) => HEALTH[e.health] || HEALTH.Grey!
const moving = (e: EbEnv) => ['Updating', 'Launching', 'Terminating'].includes(e.status)
const changing = (i: Ec2Instance) => ['pending', 'stopping', 'shutting-down'].includes(i.state)

/** Rack spots: three aisles of up to ten. */
const RACK_X = Array.from({ length: 10 }, (_, i) => -5.85 + i * 1.3)
const RACK_Z = [-3.6, -0.4, 2.8]
const MAX_RACKS = RACK_X.length * RACK_Z.length
/** Tower spots: two rows of four. */
const TOWER_X = [-3, -1, 1, 3]
const TOWER_Z = [-2.6, 1.4]
const MAX_TOWERS = TOWER_X.length * TOWER_Z.length
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!

interface Led { m: THREE.MeshStandardMaterial; kind: 'run' | 'change' | 'off' | 'dead'; phase: number }
interface Tower { ring: THREE.Object3D; beam: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } | null; beacon: THREE.MeshStandardMaterial; moving: boolean; phase: number }

interface Task { to: THREE.Vector3; face: number; dwell: number; work?: boolean; say?: () => string | null }

function canvasPlane(c: HTMLCanvasElement, w: number, h: number) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, side: THREE.DoubleSide })
  return mesh(new THREE.PlaneGeometry(w, h), material, false)
}

/** A small plate with a name over a line in grey, for a rack or a tower. */
function plate(text: string, sub: string, w: number, h: number, accent: string) {
  const c = document.createElement('canvas')
  c.width = 384
  c.height = Math.round((384 * h) / w)
  const x = c.getContext('2d')!
  x.fillStyle = '#161b22'
  x.beginPath()
  x.roundRect(0, 0, c.width, c.height, 14)
  x.fill()
  x.fillStyle = accent
  x.fillRect(0, 0, 8, c.height)
  x.textBaseline = 'middle'
  x.fillStyle = '#e6edf3'
  x.font = `700 ${Math.round(c.height * 0.36)}px ${FONT}`
  x.fillText(text, 20, c.height * 0.36, c.width - 30)
  x.fillStyle = 'rgba(230,237,243,.6)'
  x.font = `500 ${Math.round(c.height * 0.24)}px ${FONT}`
  x.fillText(sub, 20, c.height * 0.74, c.width - 30)
  return canvasPlane(c, w, h)
}

export class AwsDataCentre {
  readonly group = new THREE.Group()
  private dyn = new THREE.Group()
  private sign = floorText(18, 2.3, 'center')
  private board: ReturnType<typeof bigScreen>
  private boardAt = 0
  private key = ''
  private data: DcData = { profile: '', region: '', instances: [], envs: [] }
  private leds: Led[] = []
  private towers: Tower[] = []
  private extras: ReturnType<typeof floorText>[] = []
  private spots = new Map<string, THREE.Vector3>()
  private tech: { fig: Figure; task: Task | null; until: number; speech: HTMLElement; sayUntil: number } | null = null

  constructor() {
    this.board = bigScreen(6, 2.2, 2.6)
    this.buildShell()
    this.group.add(this.dyn)
    this.hire()
  }

  /** Where a picked thing stands, in world space, for the camera to fly to. */
  where(id: string): THREE.Vector3 | null {
    const p = this.spots.get(id)
    return p ? this.group.localToWorld(p.clone()) : null
  }

  sync(d: DcData) {
    this.data = d
    this.paintSign(d)
    this.boardAt = 0
    const key = JSON.stringify([
      d.profile, d.region, !!d.loading, !!d.locked,
      d.instances.map(i => [i.id, i.name, i.state]),
      d.envs.map(e => [e.env, e.health, e.status, e.version]),
    ])
    if (key === this.key) return
    this.key = key
    this.clearDyn()
    if (!d.locked) {
      this.buildRacks(d.instances)
      this.buildTowers(d.envs)
    }
  }

  step(t: number, dt: number) {
    for (const l of this.leds) {
      l.m.emissiveIntensity = l.kind === 'run' ? ((t * 3 + l.phase) % 1 < 0.75 ? 1.6 : 0.25)
        : l.kind === 'change' ? 0.8 + Math.sin(t * 3 + l.phase) * 0.7
          : l.kind === 'dead' ? 0.35 : 0
    }
    for (const w of this.towers) {
      w.ring.rotation.y += dt * (w.moving ? 3 : 0.4)
      w.beacon.emissiveIntensity = w.moving ? 1.4 + Math.sin(t * 5 + w.phase) * 0.8 : 1.2
      if (w.beam) w.beam.material.opacity = 0.35 + Math.sin(t * 2.5 + w.phase) * 0.2
    }
    this.stepTech(t, dt)
    if (t >= this.boardAt) {
      this.boardAt = t + 2
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

    const pad = rbox(DC_SIZE.w, 0.08, DC_SIZE.d, mat('#2a2f3a', { roughness: 0.95 }), -0.06, 0.04)
    pad.castShadow = false
    pad.position.z = DC_SIZE.cz
    g.add(pad)
    tag(pad, { kind: 'aws', id: 'dc' })

    const wall = '#3a3f47'
    g.add(lowWall(v(-half, -WING_D / 2), v(half, -WING_D / 2), wall))
    g.add(lowWall(v(-half, -WING_D / 2), v(-half, WING_D / 2), wall))
    g.add(lowWall(v(half, -WING_D / 2), v(half, WING_D / 2), wall))
    const split = DC_WINGS.envs - ROOMS[1].w / 2
    g.add(lowWall(v(split, -WING_D / 2), v(split, WING_D / 2), wall))

    for (const r of ROOMS) {
      const x0 = DC_WINGS[r.id]
      // A raised floor of grey tiles in the hall; the Beanstalk wing a dark green carpet.
      const floor = carpet(r.w - 0.3, WING_D - 0.3, r.id === 'racks' ? '#3d434c' : '#1f3a2c')
      floor.position.x = x0
      g.add(floor)
      tag(floor, { kind: 'aws', id: `wing:${r.id}` })
      this.spots.set(`wing:${r.id}`, new THREE.Vector3(x0, 0, 0))
      g.add(lowWall(v(x0 - r.w / 2, WING_D / 2), v(x0 - 1.1, WING_D / 2), wall))
      g.add(lowWall(v(x0 + 1.1, WING_D / 2), v(x0 + r.w / 2, WING_D / 2), wall))
      const arch = doorArch(r.name, r.color)
      arch.position.set(x0, 0, WING_D / 2)
      g.add(arch)
      // Cool white light, as a machine room has.
      const light = new THREE.PointLight('#dbe7ff', 24, 0, 2)
      light.position.set(x0, 3.4, 0)
      g.add(light)
      const pool = lightPool(r.w, WING_D)
      pool.material.opacity = 0.2
      pool.mesh.position.x = x0
      g.add(pool.mesh)
    }

    const b = this.board
    b.group.position.set(DC_WINGS.envs, 2.6, -WING_D / 2 + 0.6)
    g.add(b.group)
    tag(b.group, { kind: 'aws', id: 'wing:envs' })

    // The gateway faces the office, which is to the right.
    const gate = doorArch('AWS', '#232f3e')
    gate.scale.setScalar(1.5)
    gate.position.set(DC_SIZE.w / 2 - 0.5, 0, DC_PATH_Z)
    gate.rotation.y = -Math.PI / 2
    g.add(gate)
    tag(gate, { kind: 'aws', id: 'dc' })
    this.spots.set('dc', new THREE.Vector3(0, 0, WING_D / 2 + 2))

    this.sign.plane.position.set(0, 0.07, WING_D / 2 + 2.3)
    g.add(this.sign.plane)
    tag(this.sign.plane, { kind: 'aws', id: 'dc' })
  }

  private paintSign(d: DcData) {
    const running = d.instances.filter(i => i.state === 'running').length
    const deploying = d.envs.filter(moving).length
    const sick = d.envs.filter(e => e.health === 'Red' || e.health === 'Yellow').length
    const empty = !d.instances.length && !d.envs.length
    const line = d.locked
      ? 'Locked: enter your TOTP code in the AWS window'
      : !d.profile
        ? 'Open the AWS window to pick a profile'
        : d.error && empty
          ? `Can't read AWS: ${d.error.slice(0, 70)}`
          : d.loading && empty
            ? 'Reading AWS…'
            : `${d.profile} · ${d.region} · ${running} running · ${d.envs.length} environments${deploying ? ` · ${deploying} deploying` : ''}${sick ? ` · ${sick} need attention` : ''}`
    if ((this.sign.plane.userData.key as string) === line) return
    this.sign.plane.userData.key = line
    this.sign.draw([
      { text: 'AWS Data Centre', size: 1, color: 'rgba(230, 237, 243, .85)', weight: 700 },
      { text: line, size: 0.5, color: sick || d.locked ? 'rgba(242, 201, 76, .9)' : 'rgba(230, 237, 243, .55)', weight: 500 },
    ])
  }

  /** The board: each environment's health and version, those deploying first. */
  private paintBoard() {
    const c = this.board.canvas, x = c.getContext('2d')!
    const W = c.width, H = c.height
    x.fillStyle = '#0d1117'
    x.fillRect(0, 0, W, H)
    const envs = [...this.data.envs].sort((a, b) => Number(moving(b)) - Number(moving(a)) || (a.health === 'Green' ? 1 : 0) - (b.health === 'Green' ? 1 : 0))
    const going = envs.filter(moving).length
    const sick = envs.filter(e => e.health === 'Red' || e.health === 'Yellow').length
    x.textBaseline = 'middle'
    x.font = `800 ${H * 0.13}px ${FONT}`
    x.fillStyle = going ? '#f5b544' : sick ? '#ff4d4f' : '#2da44e'
    x.fillText(this.data.locked ? '🔒 LOCKED' : going ? `● DEPLOYING · ${going}` : sick ? `▲ ${sick} NEED ATTENTION` : '✓ ALL HEALTHY', W * 0.04, H * 0.12)
    const rh = H * 0.15
    envs.slice(0, 5).forEach((e, i) => {
      const y = H * 0.3 + i * rh
      x.fillStyle = i % 2 ? '#161b22' : '#11161d'
      x.fillRect(W * 0.03, y - rh / 2 + 4, W * 0.94, rh - 8)
      x.fillStyle = healthOf(e)
      x.beginPath()
      x.arc(W * 0.06, y, H * 0.025, 0, Math.PI * 2)
      x.fill()
      x.font = `700 ${H * 0.075}px ${FONT}`
      x.fillStyle = '#e6edf3'
      x.fillText(e.env, W * 0.09, y, W * 0.42)
      x.font = `500 ${H * 0.065}px ${FONT}`
      x.fillStyle = 'rgba(230,237,243,.6)'
      x.fillText(e.version, W * 0.53, y, W * 0.24)
      x.textAlign = 'right'
      x.fillStyle = moving(e) ? '#f5b544' : healthOf(e)
      x.font = `700 ${H * 0.07}px ${FONT}`
      x.fillText(moving(e) ? e.status : e.health || 'Grey', W * 0.95, y)
      x.textAlign = 'left'
    })
    if (!envs.length) {
      x.font = `500 ${H * 0.08}px ${FONT}`
      x.fillStyle = 'rgba(230,237,243,.5)'
      x.fillText(this.data.locked ? 'Unlock AWS to see it' : this.data.loading ? 'Reading AWS…' : 'No Beanstalk environments here', W * 0.04, H * 0.45)
    }
    this.board.texture.needsUpdate = true
  }

  private clearDyn() {
    this.dyn.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove() })
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o)
      disposeTree(o)
    }
    for (const e of this.extras) disposeTree(e.plane)
    this.extras = []
    this.leds = []
    this.towers = []
    for (const k of [...this.spots.keys()]) if (!k.startsWith('wing:') && k !== 'dc') this.spots.delete(k)
  }

  private note(text: string, x: number, z: number, w = 5) {
    const f = floorText(w, 0.6, 'center')
    f.draw([{ text, size: 0.42, color: 'rgba(230, 237, 243, .6)', weight: 500 }])
    f.plane.position.set(x, 0.07, z)
    this.dyn.add(f.plane)
    this.extras.push(f)
  }

  // ------------------------------------------------------------ racks

  /** A rack per instance, running ones first, then by name. */
  private buildRacks(list: Ec2Instance[]) {
    const x0 = DC_WINGS.racks
    const order = (i: Ec2Instance) => (i.state === 'running' ? 0 : changing(i) ? 1 : i.state === 'stopped' ? 2 : 3)
    const shown = [...list].filter(i => i.state !== 'terminated' || list.length < MAX_RACKS).sort((a, b) => order(a) - order(b) || (a.name || a.id).localeCompare(b.name || b.id)).slice(0, MAX_RACKS)
    if (!shown.length) {
      this.note(this.data.loading ? 'Reading EC2…' : 'No instances in this region', x0, 0, 8)
      return
    }
    shown.forEach((inst, k) => {
      const pos = new THREE.Vector3(x0 + RACK_X[k % RACK_X.length]!, 0, RACK_Z[Math.floor(k / RACK_X.length)]!)
      this.rack(inst, pos)
    })
    const more = list.length - shown.length
    if (more > 0) this.note(`+${more} more`, x0, WING_D / 2 - 1)
  }

  private rack(inst: Ec2Instance, pos: THREE.Vector3) {
    const g = new THREE.Group()
    g.position.copy(pos)
    const body = rbox(0.9, 2.05, 0.95, mat(inst.state === 'stopped' ? '#2a2d33' : '#1e2228', { roughness: 0.5, metalness: 0.3 }), 0, 0.04)
    g.add(body)
    // A front door of mesh, then blades with their lights.
    const kind: Led['kind'] = inst.state === 'running' ? 'run' : changing(inst) ? 'change' : inst.state === 'terminated' ? 'dead' : 'off'
    const color = kind === 'run' ? '#3ddc84' : kind === 'change' ? '#f5b544' : kind === 'dead' ? '#ff4d4f' : '#3a3f47'
    for (let s = 0; s < 6; s++) {
      const blade = rbox(0.76, 0.22, 0.04, mat('#2f343c', { roughness: 0.6 }), 0.18 + s * 0.3, 0.02)
      blade.position.z = 0.48
      g.add(blade)
      const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1, roughness: 0.3 })
      this.leds.push({ m, kind, phase: (hashOf(inst.id) % 100) / 100 + s * 0.17 })
      const led = mesh(geo('dc-led', () => new THREE.BoxGeometry(0.08, 0.05, 0.02)), m, false)
      led.position.set(0.26, 0.29 + s * 0.3, 0.51)
      g.add(led)
    }
    const label = plate(inst.name || inst.id, `${inst.type} · ${inst.state}`, 1.2, 0.42, color)
    label.rotation.x = -Math.PI / 2
    label.position.set(0, 0.06, 0.95)
    g.add(label)
    tag(g, { kind: 'aws', id: `ec2:${inst.id}` })
    this.spots.set(`ec2:${inst.id}`, pos.clone().add(new THREE.Vector3(0, 1, 0)))
    this.dyn.add(g)
  }

  // ------------------------------------------------------------ towers

  private buildTowers(list: EbEnv[]) {
    const x0 = DC_WINGS.envs
    const shown = [...list].sort((a, b) => Number(moving(b)) - Number(moving(a)) || a.env.localeCompare(b.env)).slice(0, MAX_TOWERS)
    if (!shown.length) {
      this.note(this.data.loading ? 'Reading Beanstalk…' : 'No environments in this region', x0, 0, 7)
      return
    }
    shown.forEach((e, k) => {
      const pos = new THREE.Vector3(x0 + TOWER_X[k % TOWER_X.length]!, 0, TOWER_Z[Math.floor(k / TOWER_X.length)]!)
      this.tower(e, pos)
    })
    const more = list.length - shown.length
    if (more > 0) this.note(`+${more} more`, x0, WING_D / 2 - 1)
  }

  private tower(e: EbEnv, pos: THREE.Vector3) {
    const g = new THREE.Group()
    g.position.copy(pos)
    const color = healthOf(e)
    g.add(rbox(1.1, 0.25, 1.1, mat('#30363d', { roughness: 0.7 }), 0, 0.06))
    const shaft = mesh(geo('dc-shaft', () => new THREE.CylinderGeometry(0.26, 0.34, 1.9, 16)), mat('#3b4250', { roughness: 0.4, metalness: 0.4 }))
    shaft.position.y = 1.2
    g.add(shaft)
    const beacon = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.25 })
    const top = mesh(geo('dc-beacon', () => new THREE.SphereGeometry(0.3, 20, 14)), beacon, false)
    top.position.y = 2.35
    g.add(top)
    const ring = mesh(geo('dc-ring', () => new THREE.TorusGeometry(0.48, 0.04, 8, 32)), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }), false)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 2.35
    const spin = new THREE.Group()
    spin.add(ring)
    g.add(spin)
    let beam: Tower['beam'] = null
    if (moving(e)) {
      beam = lightPillar('#f5b544')
      beam.mesh.scale.set(0.6, 1, 0.6)
      g.add(beam.mesh)
    }
    const label = plate(e.env, `${e.version} · ${e.status}`, 1.7, 0.5, color)
    label.rotation.x = -Math.PI / 2
    label.position.set(0, 0.06, 0.95)
    g.add(label)
    this.towers.push({ ring: spin, beam, beacon, moving: moving(e), phase: (hashOf(e.env) % 100) / 15 })
    tag(g, { kind: 'aws', id: `eb:${e.env}` })
    this.spots.set(`eb:${e.env}`, pos.clone().add(new THREE.Vector3(0, 1.2, 0)))
    this.dyn.add(g)
  }

  // ------------------------------------------------------------ the technician

  private hire() {
    const fig = figure({ seed: 7, role: 'developer' })
    fig.group.position.set(DC_WINGS.racks, 0, 1.2)
    this.group.add(fig.group)
    tag(fig.group, { kind: 'aws', id: 'wing:racks' })
    const el = document.createElement('div')
    el.className = 'sim-tag'
    const speech = document.createElement('div')
    speech.className = 'sim-say'
    speech.style.display = 'none'
    const chip = document.createElement('div')
    chip.className = 'sim-chip'
    const i = document.createElement('i')
    i.style.background = '#ff9900'
    const b = document.createElement('b')
    b.textContent = 'Sam'
    const s = document.createElement('span')
    s.textContent = 'Technician'
    chip.append(i, b, s)
    el.append(speech, chip)
    const obj = new CSS2DObject(el)
    obj.position.set(0, 2.1, 0)
    fig.group.add(obj)
    this.tech = { fig, task: null, until: 0, speech, sayUntil: 0 }
  }

  /** Off to a rack or a tower (one that's changing or unwell most likely), to look it over and say how it is. */
  private nextTask(): Task {
    const d = this.data
    const racks = d.instances.filter(i => this.spots.has(`ec2:${i.id}`))
    const towers = d.envs.filter(e => this.spots.has(`eb:${e.env}`))
    const weightE = (e: EbEnv) => (moving(e) ? 5 : e.health === 'Red' ? 4 : e.health === 'Yellow' ? 3 : 1)
    const weightI = (i: Ec2Instance) => (changing(i) ? 4 : i.state === 'running' ? 1 : 1)
    const pool: ({ kind: 'i'; i: Ec2Instance } | { kind: 'e'; e: EbEnv })[] = [
      ...racks.flatMap(i => Array(weightI(i)).fill({ kind: 'i', i })),
      ...towers.flatMap(e => Array(weightE(e)).fill({ kind: 'e', e })),
    ]
    if (!pool.length) {
      return { to: new THREE.Vector3(DC_WINGS.racks + (Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 8), face: Math.random() * 6, dwell: 3, say: () => (d.locked ? 'Locked out until someone types the code' : Math.random() < 0.3 ? 'Quiet in here today' : null) }
    }
    const p = pick(pool)
    if (p.kind === 'i') {
      const i = p.i
      const name = i.name || i.id
      const at = this.spots.get(`ec2:${i.id}`)!
      return {
        to: new THREE.Vector3(at.x, 0, at.z + 1.4), face: Math.PI, dwell: 3 + Math.random() * 2, work: true,
        say: () => (i.state === 'running' ? (Math.random() < 0.5 ? pick([`${name} humming along`, `${name}: ${i.type}, all good`]) : null)
          : changing(i) ? `${name} is ${i.state}…`
            : i.state === 'stopped' ? `${name} is powered down` : null),
      }
    }
    const e = p.e
    const at = this.spots.get(`eb:${e.env}`)!
    return {
      to: new THREE.Vector3(at.x + 0.9, 0, at.z + 0.6), face: -Math.PI / 2, dwell: 3.5, work: true,
      say: () => (moving(e) ? pick([`Deploying ${e.version} to ${e.env}…`, `${e.env} is ${e.status.toLowerCase()}`])
        : e.health === 'Red' ? `${e.env} is red! Someone look at it`
          : e.health === 'Yellow' ? `${e.env} looks unwell`
            : Math.random() < 0.4 ? `${e.env} on ${e.version} ✅` : null),
    }
  }

  private stepTech(t: number, dt: number) {
    const c = this.tech
    if (!c) return
    const f = c.fig
    if (!c.task) {
      c.task = this.nextTask()
      c.until = 0
    }
    const task = c.task
    const pos = f.group.position
    const d = task.to.clone().setY(0).sub(pos)
    const dist = d.length()
    if (!c.until && dist > 0.05) {
      pos.add(d.normalize().multiplyScalar(Math.min(dist, 1.6 * dt)))
      const want = Math.atan2(d.x, d.z)
      f.group.rotation.y += Math.atan2(Math.sin(want - f.group.rotation.y), Math.cos(want - f.group.rotation.y)) * Math.min(1, dt * 10)
      f.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 10 + i * Math.PI) * 0.5 })
      f.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 10 + i * Math.PI + Math.PI) * 0.4 })
      return
    }
    if (!c.until) {
      c.until = t + task.dwell
      const line = task.say?.()
      if (line) {
        c.speech.textContent = line
        c.speech.style.display = ''
        c.sayUntil = t + 3.8
      }
    }
    const want = task.face
    f.group.rotation.y += Math.atan2(Math.sin(want - f.group.rotation.y), Math.cos(want - f.group.rotation.y)) * Math.min(1, dt * 6)
    f.legs.forEach((l) => { l.rotation.x = 0 })
    if (task.work) {
      f.arms[0].rotation.x = -1 + Math.sin(t * 6) * 0.35
      f.arms[1].rotation.x = -1 + Math.sin(t * 6 + 2) * 0.35
    }
    if (c.sayUntil && t >= c.sayUntil) {
      c.speech.style.display = 'none'
      c.sayUntil = 0
    }
    if (t >= c.until) c.task = null
  }
}
