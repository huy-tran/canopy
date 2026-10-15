// Which desktop the window runs on, for the few words and paths that differ.
export const isWin = typeof navigator !== 'undefined' && /^Win/i.test(navigator.platform)

/** The name of the file manager: "Explorer" on Windows, the generic "file manager" elsewhere. */
export const fileManager = isWin ? 'Explorer' : 'file manager'

/** A repo-relative path ("app/x.ts") on the machine: backslashes on Windows, as the folder is written. */
export function joinPath(root: string, rel: string): string {
  const base = root.replace(/[\/]$/, '')
  return isWin ? `${base}\${rel.replace(/\//g, '\')}` : `${base}/${rel}`
}
