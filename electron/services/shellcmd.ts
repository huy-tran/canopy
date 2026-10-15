// How a command line is run on each OS. No Electron imports, so the tests can load it.
import { execFile } from 'node:child_process'
import fs from 'node:fs'

export const IS_WIN = process.platform === 'win32'

/** The user's login shell, or /bin/sh when SHELL is missing or not a real file. */
export function posixShell(env: NodeJS.ProcessEnv = process.env): string {
  const s = env.SHELL
  return s && s.startsWith('/') && fs.existsSync(s) ? s : '/bin/sh'
}

/**
 * The program and arguments that run `cmd` as typed: cmd.exe on Windows, the user's own shell elsewhere.
 * The Windows arguments are one raw string, because node-pty would otherwise re-escape the quotes inside `cmd`.
 * Elsewhere the shell is a login, interactive one, so PATH is the one the terminal gives (mise, nvm, ~/.local/bin).
 */
export function commandLine(cmd: string, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): { file: string; args: string | string[] } {
  if (platform === 'win32') return { file: env.ComSpec || 'cmd.exe', args: `/d /s /c "${cmd}"` }
  return { file: posixShell(env), args: ['-l', '-i', '-c', cmd] }
}

/** Takes the PATH of a login shell, since an app started from a launcher or a keybinding often has a bare one. */
export async function adoptLoginPath(): Promise<void> {
  if (IS_WIN) return
  const out = await new Promise<string>((resolve) => {
    execFile(posixShell(), ['-l', '-i', '-c', 'printf "__PATH__%s__PATH__" "$PATH"'], { encoding: 'utf8', timeout: 6000 }, (_e, stdout) => resolve(stdout || ''))
  })
  const m = out.match(/__PATH__(.*?)__PATH__/s)
  if (m?.[1]) process.env.PATH = [...new Set([...m[1].split(':'), ...(process.env.PATH || '').split(':')])].filter(Boolean).join(':')
}

/** Finds a program on PATH without starting anything; undefined when it isn't there. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const dir of (env.PATH || '').split(':')) {
    if (!dir) continue
    const file = `${dir}/${name}`
    try {
      if (fs.statSync(file).isFile()) {
        fs.accessSync(file, fs.constants.X_OK)
        return file
      }
    } catch {
      // Not here.
    }
  }
  return undefined
}
