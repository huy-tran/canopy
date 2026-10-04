// Editors, Explorer, browser, fonts, app info and clipboard images.
import { app, clipboard, ClipboardItem, nativeImage, shell } from 'electron'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppInfo, ShellInfo } from '../../shared/types'

const EDITOR_CLI: Record<string, string[]> = {
  'VS Code': ['code'],
  'Cursor': ['cursor'],
  'PhpStorm': ['phpstorm', 'phpstorm64'],
  'Zed': ['zed'],
}

function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, encoding: 'utf8', timeout: 8000, shell: true }, (err, stdout) => resolve({ ok: !err, out: (stdout || '').trim() }))
  })
}

async function which(name: string): Promise<string> {
  const r = await run('where', [name])
  return r.ok ? r.out.split(/\r?\n/)[0]!.trim() : ''
}

/** Opens a folder (and optionally a file in it) with the editor's CLI. */
export async function openInEditor(editor: string, folder: string, file?: string): Promise<{ ok: boolean; error?: string }> {
  for (const cli of EDITOR_CLI[editor] || []) {
    const bin = await which(cli)
    if (!bin) continue
    const args = file ? (editor === 'PhpStorm' ? [folder, file] : [folder, '-g', file]) : [folder]
    const child = spawn(bin, args, { detached: true, stdio: 'ignore', shell: /\.(cmd|bat)$/i.test(bin), windowsHide: true })
    child.unref()
    return { ok: true }
  }
  return { ok: false, error: `${editor} command line tool not found. Install it and make sure it is on your PATH.` }
}

export function showInFolder(p: string) {
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) shell.openPath(p)
  else shell.showItemInFolder(p)
}

let infoCache: AppInfo | null = null

export async function appInfo(): Promise<AppInfo> {
  if (infoCache) return infoCache
  const claudePath = await which('claude')
  const v = claudePath ? await run('claude', ['--version']) : { ok: false, out: '' }
  const rel = os.release().split('.')
  const build = +(rel[2] || 0)
  infoCache = {
    version: app.getVersion(),
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    claudeVersion: v.ok ? (v.out.match(/[\d.]+/)?.[0] || v.out) : 'Not found',
    claudePath: claudePath || 'Not found on PATH',
    windows: `${build >= 22000 ? '11' : '10'} ${os.arch()} (${os.release()})`,
  }
  return infoCache
}

const MONO = /mono|code|consol|courier|cascadia|hack|iosevka|menlo|inconsolata|terminal|fixed|lucida console|nerd font|source code|fira|sf mono|ubuntu mono|dejavu sans mono|liberation mono|roboto mono|victor|monaspace|geist mono|comic mono|input/i

const STYLE_WORDS = /\b(thin|hairline|extra ?light|ultra ?light|light|semi ?light|book|regular|normal|medium|semi ?bold|demi ?bold|bold|extra ?bold|ultra ?bold|heavy|black|italic|oblique|condensed|semi ?condensed|expanded)\b/gi

/** Font families installed for the machine and the user, read from the registry. */
export async function listFonts(): Promise<{ name: string; nerd: boolean; mono: boolean }[]> {
  const keys = ['HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', 'HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts']
  const families = new Set<string>()
  for (const key of keys) {
    const r = await run('reg', ['query', `"${key}"`])
    for (const line of r.out.split(/\r?\n/)) {
      const m = line.match(/^\s{4}(.+?)\s{4}REG_SZ/)
      if (!m) continue
      // "monofur   bold for Powerline (TrueType)" -> "monofur for Powerline"; collections list "A & B".
      for (const part of m[1]!.replace(/\s*\((TrueType|OpenType|All res|VGA res|.*?res)\)\s*$/i, '').split(' & ')) {
        const name = part.replace(STYLE_WORDS, '').replace(/\s+/g, ' ').trim()
        if (name && !/^\d/.test(name)) families.add(name)
      }
    }
  }
  return [...families]
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ name, nerd: /nerd font/i.test(name), mono: MONO.test(name) || /monofur/i.test(name) }))
}

function imagesDir(sid: string) {
  const d = path.join(app.getPath('userData'), 'images', sid)
  fs.mkdirSync(d, { recursive: true })
  return d
}

/** Saves PNG bytes (from a paste event) so the path can be handed to Claude. */
export function saveImage(sid: string, name: string, bytes: Uint8Array): string {
  const file = path.join(imagesDir(sid), name.replace(/[^\w.-]/g, '_'))
  fs.writeFileSync(file, Buffer.from(bytes))
  return file
}

export async function copyImage(file: string) {
  const png = nativeImage.createFromPath(file).toPNG()
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })])
}

export function clearImages() {
  try {
    fs.rmSync(path.join(app.getPath('userData'), 'images'), { recursive: true, force: true })
  } catch {
    // Nothing to clear.
  }
}

let shellCache: ShellInfo[] | null = null

/** Plain shells installed on this machine, in the order they are offered. */
export async function listShells(): Promise<ShellInfo[]> {
  if (shellCache) return shellCache
  const out: ShellInfo[] = []
  const pwsh = await which('pwsh')
  if (pwsh) out.push({ kind: 'pwsh', label: 'PowerShell 7', exe: pwsh })
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (fs.existsSync(ps)) out.push({ kind: 'powershell', label: 'Windows PowerShell', exe: ps })
  // Git for Windows: <root>\cmd\git.exe or <root>\mingw64\bin\git.exe, with bash in <root>\bin.
  const git = await which('git')
  const roots = [git && path.resolve(path.dirname(git), '..'), git && path.resolve(path.dirname(git), '..', '..'), 'C:\\Program Files\\Git']
  const bash = roots.filter(Boolean).map(r => path.join(r as string, 'bin', 'bash.exe')).find(p => fs.existsSync(p))
  if (bash) out.push({ kind: 'gitbash', label: 'Git Bash', exe: bash })
  const wsl = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe')
  if (fs.existsSync(wsl)) {
    // Only offer WSL with a real distro; Docker Desktop installs internal ones that aren't usable shells.
    const list = (await run('wsl.exe', ['-l', '-q'])).out.replace(/\0/g, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (list.some(d => !/^docker-desktop/i.test(d))) out.push({ kind: 'wsl', label: 'WSL', exe: wsl })
  }
  out.push({ kind: 'cmd', label: 'Command Prompt', exe: process.env.ComSpec || 'cmd.exe' })
  shellCache = out
  return out
}
