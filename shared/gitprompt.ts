// What a git push is waiting for, read from the last line of its terminal output (ssh asks on the terminal, not on stdin).
// Pure, so it is tested without a pty; electron/services/gitpush.ts feeds it.

export type GitPrompt =
  /** A key's passphrase; `label` is the key's path. */
  | { kind: 'passphrase'; label: string }
  /** An account password, for ssh or for an https remote; `label` says whose. */
  | { kind: 'password'; label: string }
  /** First contact with a host: ssh asks whether to trust it. Never answered for the user. */
  | { kind: 'hostkey'; label: string }

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)/g

/** Output with its colour and cursor codes removed, and carriage returns turned into line breaks. */
export function plain(text: string): string {
  return text.replace(ANSI, '').replace(/\r\n?/g, '\n')
}

/** The line git or ssh stopped on, when it is a question; null while the output is just progress. */
export function promptOf(output: string): GitPrompt | null {
  const text = plain(output)
  const last = text.slice(text.lastIndexOf('\n') + 1)
  if (!last) return null
  let m = /^Enter passphrase for (?:key )?'?([^'\n]+?)'?: $/.exec(last)
  if (m) return { kind: 'passphrase', label: m[1]! }
  m = /^(?:([^\s@]+@[^\s']+)'s password|Password for '([^'\n]+)'|(?:\([^)\n]*\) )?Password): $/.exec(last)
  if (m) return { kind: 'password', label: m[1] || m[2] || '' }
  if (/\((?:yes\/no|yes\/no\/\[fingerprint\])\)\? $/.test(last)) return { kind: 'hostkey', label: last.trim() }
  return null
}

/** The part of the output worth showing when a push failed: what git said, without progress lines or the prompts. */
export function failureText(output: string): string {
  const lines = plain(output).split('\n').map(l => l.trim()).filter(Boolean)
  const said = lines.filter(l => !/^(Enumerating|Counting|Compressing|Writing|Delta|Total|remote: (Resolving|Counting|Compressing))/i.test(l) && !/^Enter passphrase for/.test(l))
  return said.slice(-6).join('\n')
}
