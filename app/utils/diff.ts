// Unified diffs as rows to draw, shared by the file explorer and the GitHub view's PR files.
import { highlightLines, plainSegs, type HlSeg } from '~/composables/useHighlighter'

export interface DiffLine { n: string; sign: string; t: string; bg: string; sc: string; tc: string; hunk: boolean; segs: HlSeg[] }

export const mkAdd = (n: number, t: string): DiffLine => ({ n: String(n), sign: '+', t, bg: 'var(--addbg)', sc: 'var(--grn)', tc: 'var(--ttx)', hunk: false, segs: plainSegs(t) })
export const mkDel = (n: number, t: string): DiffLine => ({ n: String(n), sign: '-', t, bg: 'var(--delbg)', sc: 'var(--red)', tc: 'var(--ttx)', hunk: false, segs: plainSegs(t) })
export const mkCtx = (n: number, t: string): DiffLine => ({ n: String(n), sign: ' ', t, bg: 'transparent', sc: 'var(--fa)', tc: 'var(--tx3)', hunk: false, segs: plainSegs(t) })
export const mkHunk = (t: string): DiffLine => ({ n: '', sign: '', t, bg: 'var(--pbg)', sc: 'var(--fa)', tc: 'var(--mu)', hunk: true, segs: plainSegs(t) })
export const mkLine = (n: number, t: string): DiffLine => ({ n: String(n), sign: ' ', t, bg: 'transparent', sc: 'var(--fa)', tc: 'var(--ttx)', hunk: false, segs: plainSegs(t) })

/** Unified diff text into hunk/add/del/context rows with old/new line numbers. */
export function parseDiff(txt: string): DiffLine[] {
  const R: DiffLine[] = []
  let o = 0, n = 0, inHunk = false
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (m) {
      o = +m[1]!
      n = +m[2]!
      inHunk = true
      R.push(mkHunk(line))
      continue
    }
    if (line.startsWith('diff --git')) {
      inHunk = false
      continue
    }
    if (!inHunk) {
      if (/^Binary files /.test(line)) R.push(mkHunk('Binary file'))
      continue
    }
    if (line.startsWith('\\')) continue
    const c = line[0], t = line.slice(1)
    if (c === '+') R.push(mkAdd(n++, t))
    else if (c === '-') R.push(mkDel(o++, t))
    else if (c === ' ') {
      R.push(mkCtx(n, t))
      o++
      n++
    }
  }
  return R
}

/** A whole PR's diff split per file, keyed by the file's (new) path. */
export function splitDiff(txt: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const chunk of txt.split(/^(?=diff --git )/m)) {
    const m = chunk.match(/^diff --git a\/(.+?) b\/(.+?)\r?$/m)
    if (m) out.set(m[2]!, chunk)
  }
  return out
}

/** Highlights each hunk of a file's rows as its own block of code, in place. Resolves false if nothing was highlighted. */
export async function highlightDiff(lines: DiffLine[], path: string): Promise<boolean> {
  const blocks: DiffLine[][] = []
  let blk: DiffLine[] = []
  for (const ln of lines) {
    if (ln.hunk) {
      if (blk.length) blocks.push(blk)
      blk = []
    } else blk.push(ln)
  }
  if (blk.length) blocks.push(blk)
  const res = await Promise.all(blocks.map(b => highlightLines(b.map(l => l.t), path)))
  if (res.every(r => !r)) return false
  blocks.forEach((b, bi) => {
    const r = res[bi]
    if (r) b.forEach((l, li) => { l.segs = r[li] || l.segs })
  })
  return true
}
