// Checks for values that come from the renderer before they reach the file system, git, gh or a shell.
import fs from 'node:fs'
import path from 'node:path'

/** True when `child` is `root` or sits inside it (symlinks resolved when the path exists). */
export function isInside(root: string, child: string): boolean {
  const real = (p: string) => {
    try {
      return fs.realpathSync.native(p)
    } catch {
      return path.resolve(p)
    }
  }
  const rel = path.relative(real(root), real(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** A git ref or branch name: never starts with "-", so git can't read it as an option. */
export function safeRef(s: unknown): string {
  if (typeof s !== 'string' || !/^[\w][\w./@#+-]*$/.test(s) || s.includes('..') || s.endsWith('.lock') || s.endsWith('/')) throw new Error(`Not a valid branch name: ${String(s)}`)
  return s
}

/** One file or folder name made of safe characters only. */
export function safeSegment(s: unknown): string {
  if (typeof s !== 'string' || !/^[\w][\w.-]*$/.test(s) || s.includes('..')) throw new Error(`Not a valid name: ${String(s)}`)
  return s
}

/** Characters cmd.exe treats as syntax; a path holding one can't be handed to a .cmd or .bat file. */
const CMD_META = /[&|<>^"%!`\r\n\0]/

export function noShellMeta(s: string): string {
  if (CMD_META.test(s)) throw new Error('That path has characters that are not safe to pass to a command.')
  return s
}

/** owner/name of a GitHub repo; the owner never starts with "-", so gh can't read it as an option. */
export const isRepoName = (s: unknown): s is string => typeof s === 'string' && /^\w[\w.-]*\/[\w.][\w.-]*$/.test(s)

export function safeRepo(s: unknown): string {
  if (!isRepoName(s)) throw new Error(`Not a GitHub repo: ${String(s)}`)
  return s
}

/** The link to a GitHub pull request. */
export function safePullUrl(s: unknown): string {
  if (typeof s !== 'string' || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?$/.test(s)) throw new Error(`Not a pull request link: ${String(s)}`)
  return s
}

/** A positive whole number, such as a run or workflow id. */
export function safeId(n: unknown): number {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) throw new Error(`Not an id: ${String(n)}`)
  return n
}

/** An http(s) link, normalised; anything else (file:, custom protocols) is refused. */
export function webUrl(s: unknown): string | null {
  try {
    const u = new URL(String(s))
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}
