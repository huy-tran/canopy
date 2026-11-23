// Review comments left on lines of a diff or file, and the prompt they become for Claude.

export interface ReviewNote {
  id: string
  /** Path inside the repo, with forward slashes. */
  path: string
  /** The line number as the diff shows it: the new file's, or the old file's for a removed line. */
  line: string
  /** '+' for an added line, '-' for a removed one, '' for an unchanged line or a line of the whole file. */
  sign: string
  /** The line's text, so the comment still points somewhere after the numbers shift. */
  code: string
  text: string
}

const CODE_MAX = 120

function where(n: ReviewNote) {
  const code = n.code.trim()
  const shown = code.length > CODE_MAX ? code.slice(0, CODE_MAX) + '...' : code
  const kind = n.sign === '+' ? 'added line' : n.sign === '-' ? 'removed line, old numbering' : 'line'
  return `${n.path}:${n.line} (${kind}${shown ? ': `' + shown.replace(/`/g, "'") + '`' : ''})`
}

/** One prompt from every comment, in file then line order. Empty when there is nothing to send. */
export function notesPrompt(notes: ReviewNote[]): string {
  const list = notes.filter(n => n.text.trim())
  if (!list.length) return ''
  const sorted = [...list].sort((a, b) => a.path.localeCompare(b.path) || (+a.line || 0) - (+b.line || 0))
  const items = sorted.map((n, i) => `${i + 1}. ${where(n)}\n   ${n.text.trim().replace(/\r?\n/g, '\n   ')}`)
  return `Review comments on the current changes. Address each one:\n\n${items.join('\n')}\n`
}
