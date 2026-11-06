// Project colours come from the project's name, so nobody has to pick one.

/** 32-bit FNV-1a checksum of a string. */
export function checksum(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Closest the colours of two projects may be, in degrees of hue, before the newer one steps aside. */
export const MIN_HUE_GAP = 16
/** Each step away from a taken hue turns by the golden angle, which spreads the tries evenly round the wheel. */
const GOLDEN_ANGLE = 137.508

/** Distance between two hues round the colour wheel, 0 to 180. */
export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * The hue (0-359) for a project name: its checksum, the same on every machine, whatever the case or spacing.
 * `taken` is the hues of the other projects; when the first choice lands too close to one, the name's own
 * checksum is turned by golden-angle steps until a free place turns up, so colours stay apart for a couple of
 * dozen projects. With no room left, the try farthest from every other colour wins.
 */
export function hueOf(name: string, taken: number[] = []): number {
  const base = checksum(name.trim().toLowerCase()) % 360
  let best = base, bestGap = -1
  for (let i = 0; i < 48; i++) {
    const hue = Math.round((base + i * GOLDEN_ANGLE) % 360) % 360
    const gap = taken.length ? Math.min(...taken.map(t => hueGap(hue, t))) : 180
    if (gap >= MIN_HUE_GAP) return hue
    if (gap > bestGap) {
      best = hue
      bestGap = gap
    }
  }
  return best
}
