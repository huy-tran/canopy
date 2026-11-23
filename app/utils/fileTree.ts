// The file explorer's list: fuzzy search over paths, the highlighted pieces of a match, and the folder tree as rows.

/**
 * Matches a lowercase query against a path, letter by letter in order. Returns the positions matched and a score
 * (runs of letters, starts of words and a match inside the file name count for more), or null when it doesn't match.
 */
export function fuzzy(qs: string, path: string) {
  const P = path.toLowerCase(), base = P.lastIndexOf('/') + 1
  const run = (from: number) => {
    const idx: number[] = []
    let j = from, score = 0, prev = -2
    for (const ch of qs) {
      if (ch === ' ') continue
      const at = P.indexOf(ch, j)
      if (at < 0) return null
      idx.push(at)
      score += at === prev + 1 ? 6 : 1
      if (at === 0 || '/._-'.includes(P[at - 1]!)) score += 4
      prev = at
      j = at + 1
    }
    return { idx, score }
  }
  const b = run(base)
  if (b) return { idx: b.idx, score: b.score + 20 - path.length / 20 }
  const a = run(0)
  return a ? { idx: a.idx, score: a.score - path.length / 20 } : null
}

/** A piece of text cut into runs of matched and unmatched letters, each with its colour and weight. `off` is where the text starts in the path. */
export function hiSegs(text: string, off: number, idx: Set<number> | null, color: string, w: number) {
  const out: { hit: boolean; t: string }[] = []
  let cur: { hit: boolean; t: string } | null = null
  for (let k = 0; k < text.length; k++) {
    const hit = !!(idx && idx.has(off + k))
    if (!cur || cur.hit !== hit) {
      cur = { hit, t: '' }
      out.push(cur)
    }
    cur.t += text[k]
  }
  return out.map(s => ({ t: s.t, color: s.hit ? 'var(--lnk)' : color, w: s.hit ? 700 : w }))
}

interface TNode { name: string; path: string; dir: boolean; kids: Record<string, TNode> }

/** A list of file paths as the rows of a tree: folders first, then by name, with only the open folders' contents. */
export function treeRows(list: string[], openList: string[]) {
  const root: TNode = { name: '', path: '', dir: true, kids: {} }
  list.forEach((p) => {
    let n = root
    const parts = p.split('/')
    parts.forEach((part, i) => {
      if (!n.kids[part]) n.kids[part] = { name: part, path: parts.slice(0, i + 1).join('/'), dir: i < parts.length - 1, kids: {} }
      n = n.kids[part]!
    })
  })
  const openSet = new Set(openList)
  const rows: { name: string; path: string; dir: boolean; depth: number }[] = []
  const walk = (n: TNode, depth: number) => Object.values(n.kids)
    .sort((a, b) => (Number(b.dir) - Number(a.dir)) || a.name.localeCompare(b.name))
    .forEach((c) => {
      rows.push({ name: c.name, path: c.path, dir: c.dir, depth })
      if (c.dir && openSet.has(c.path)) walk(c, depth + 1)
    })
  walk(root, 0)
  return rows
}
