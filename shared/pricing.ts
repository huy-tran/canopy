// API-equivalent pricing in USD per million tokens. Cache write is the 5 minute rate.

interface Price { in: number; out: number; cacheW: number; cacheR: number; ctx: number }

const P = (input: number, output: number, cacheR?: number, ctx = 1_000_000): Price =>
  ({ in: input, out: output, cacheW: input * 1.25, cacheR: cacheR ?? input * 0.1, ctx })

// Most specific prefixes first.
const TABLE: [string, Price][] = [
  ['claude-fable-5', P(10, 50, 0.25)],
  ['claude-mythos-5', P(10, 50, 0.25)],
  ['claude-opus-5-5', P(4, 20, 0.2)],
  ['claude-opus-5', P(5, 25)],
  ['claude-opus-4-8', P(5, 25)],
  ['claude-opus-4-7', P(5, 25)],
  ['claude-opus-4-6', P(5, 25)],
  ['claude-opus-4-5', P(5, 25, undefined, 200_000)],
  ['claude-opus-4', P(15, 75, undefined, 200_000)],
  ['claude-sonnet-5', P(2, 10, 0.2)],
  ['claude-sonnet-4-6', P(3, 15)],
  ['claude-sonnet-4', P(3, 15, undefined, 200_000)],
  ['claude-3-7-sonnet', P(3, 15, undefined, 200_000)],
  ['claude-haiku-4', P(1, 5, undefined, 200_000)],
  ['claude-3-5-haiku', P(0.8, 4, undefined, 200_000)],
]

const FALLBACK = P(3, 15)

export function priceOf(model: string): Price {
  const m = (model || '').toLowerCase()
  for (const [k, v] of TABLE) if (m.startsWith(k)) return v
  if (m.includes('opus')) return P(5, 25)
  if (m.includes('haiku')) return P(1, 5, undefined, 200_000)
  return FALLBACK
}

export function costOf(model: string, u: { tokIn: number; tokOut: number; cacheR: number; cacheW: number }): number {
  const p = priceOf(model)
  return (u.tokIn * p.in + u.tokOut * p.out + u.cacheR * p.cacheR + u.cacheW * p.cacheW) / 1e6
}

/** Context window for a model id. A "[1m]" suffix always means 1M. */
export function contextOf(model: string): number {
  if (/\[1m\]/i.test(model || '')) return 1_000_000
  return priceOf(model).ctx
}

/** "claude-sonnet-4-6" -> "Sonnet 4.6" */
export function modelLabel(model: string): string {
  const m = (model || '').match(/claude-(?:(\d)-(\d)-)?([a-z]+)(?:-(\d+)(?:-(\d{1,2}))?)?/i)
  if (!m) return model || ''
  const fam = m[3]!.charAt(0).toUpperCase() + m[3]!.slice(1)
  if (m[1]) return `${fam} ${m[1]}.${m[2]}`
  const ver = m[4] && m[4].length <= 2 ? m[4] + (m[5] ? '.' + m[5] : '') : ''
  return ver ? `${fam} ${ver}` : fam
}
