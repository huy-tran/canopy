// What the screens in the 3D World show, painted on canvases: the Canopy Core's dashboard, the TVs' football and racing,
// and the stage's LED wall and dance floor.
import { FONT } from './kit'

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

/** One song and the break after it, in seconds. */
export const SONG = 34
export const ENCORE = 7

// ---------------------------------------------------------------- the TVs

/** A screen's canvas drawn as if 1024 wide, whatever its real width, so the TVs can be painted smaller. */
function paint(c: HTMLCanvasElement) {
  const x = c.getContext('2d')!
  const k = c.width / 1024
  x.setTransform(k, 0, 0, k, 0, 0)
  return { x, W: 1024, H: c.height / k }
}

/** The Canopy Core's dashboard: four tiles of memory, CPU, frame rate and lag, each a number over a sparkline of the last two minutes. */
export function drawCore(c: HTMLCanvasElement, m: SimMetrics, hot: boolean) {
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
export function drawFootball(c: HTMLCanvasElement, t: number, goals: [number, number], goal: boolean) {
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
export function drawRacing(c: HTMLCanvasElement, t: number) {
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
export function drawLedWall(c: HTMLCanvasElement, t: number, playing: boolean, at: number, song: number, pulse: number) {
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
export function drawDanceFloor(c: HTMLCanvasElement, tick: number, hue: number) {
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
