// SSH connections: importing from ~/.ssh/config, key picking and saved passwords.
import { app, dialog } from 'electron'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { parse } from 'yaml'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handle, state } from '../context'
import type { SshHost, SshPuttyResult, SshTabbyResult } from '../../shared/types'
import { errMessage } from '../../shared/errors'
import { parseSshConfig } from '../services/ssh'
import { mapPutty, parseRegQuery, parseSessionFile, type PuttySession } from '../services/putty'
import { configOfVault, decryptTabbyVault, mapTabby } from '../services/tabby'
import { hasSshPassword, setSshPassword } from '../services/sshsecrets'

/** Tabby's config: in the app data folder, as config.yaml. */
const tabbyFile = () => path.join(app.getPath('appData'), 'tabby', 'config.yaml')

async function importTabby(o: { passphrase?: string; existing?: { name: string; host: string; user?: string }[] }): Promise<SshTabbyResult> {
  const file = tabbyFile()
  let doc: any
  try {
    doc = parse(fs.readFileSync(file, 'utf8'))
  } catch (e: any) {
    return { status: 'error', error: e?.code === 'ENOENT' ? `No Tabby config found at ${file}.` : `Could not read ${file}: ${errMessage(e)}` }
  }
  let config = doc
  let secrets: any[] = []
  if (doc?.encrypted === true || (doc?.vault && !Array.isArray(doc.profiles))) {
    // The whole config is inside the vault, which needs its passphrase.
    if (!o.passphrase) return { status: 'passphrase' }
    const plain = await decryptTabbyVault(doc.vault, o.passphrase)
    if (!plain) return { status: 'passphrase', wrong: true }
    const found = configOfVault(plain)
    if (!found) {
      const keys = plain && typeof plain === 'object' ? Object.keys(plain as object).join(', ') : typeof plain
      return { status: 'error', error: `Opened the vault, but its contents were not what was expected (found: ${keys}).` }
    }
    config = found.config
    secrets = found.secrets
  }
  if (!config || !Array.isArray(config.profiles)) return { status: 'error', error: 'That Tabby config has no profiles.' }

  const mapped = mapTabby(config, secrets)
  const have = new Set((o.existing || []).map(h => `${h.name}|${h.host}|${h.user || ''}`.toLowerCase()))
  const hosts: SshHost[] = []
  let duplicates = 0, passwords = 0
  for (const { tabbyId, ...h } of mapped.hosts) {
    if (have.has(`${h.name}|${h.host}|${h.user || ''}`.toLowerCase())) {
      duplicates++
      continue
    }
    const id = 'h' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex')
    const pw = mapped.passwords[tabbyId]
    if (pw) {
      try {
        setSshPassword(id, pw)
        passwords++
      } catch {
        // No keychain: the profile still imports, and ssh asks for the password in the terminal.
      }
    }
    hosts.push({ ...h, id })
  }
  return { status: 'ok', hosts, passwords, skipped: mapped.skipped, duplicates }
}

/** PuTTY's saved sessions: the registry on Windows, files in ~/.putty/sessions elsewhere. */
function puttySessions(): Promise<PuttySession[]> {
  if (process.platform !== 'win32') {
    const dir = path.join(os.homedir(), '.putty', 'sessions')
    try {
      return Promise.resolve(fs.readdirSync(dir).map(f => parseSessionFile(f, fs.readFileSync(path.join(dir, f), 'utf8'))))
    } catch {
      return Promise.resolve([])
    }
  }
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\SimonTatham\\PuTTY\\Sessions', '/s'], { windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => resolve(err ? [] : parseRegQuery(stdout)))
  })
}

async function importPutty(o: { existing?: { name: string; host: string; user?: string }[] }): Promise<SshPuttyResult> {
  const sessions = await puttySessions()
  if (!sessions.length) return { status: 'error', error: 'No saved PuTTY sessions found.' }
  const mapped = mapPutty(sessions)
  const have = new Set((o.existing || []).map(h => `${h.name}|${h.host}|${h.user || ''}`.toLowerCase()))
  const hosts: SshHost[] = []
  let duplicates = 0
  for (const h of mapped.hosts) {
    if (have.has(`${h.name}|${h.host}|${h.user || ''}`.toLowerCase())) {
      duplicates++
      continue
    }
    hosts.push({ ...h, id: 'h' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex') })
  }
  return { status: 'ok', hosts, duplicates, skipped: mapped.skipped, ppk: mapped.ppk }
}

export function registerSshIpc() {
  handle('ssh:importConfig', () => {
    try {
      return parseSshConfig(fs.readFileSync(path.join(os.homedir(), '.ssh', 'config'), 'utf8'))
    } catch {
      return []
    }
  })
  handle('ssh:importPutty', (o: { existing?: { name: string; host: string; user?: string }[] }) => importPutty(o))
  handle('ssh:importTabby', (o: { passphrase?: string; existing?: { name: string; host: string; user?: string }[] }) => importTabby(o))
  handle('ssh:pickKey', async () => {
    const r = await dialog.showOpenDialog(state.win!, { defaultPath: path.join(os.homedir(), '.ssh'), properties: ['openFile', 'showHiddenFiles'] })
    return r.canceled ? null : r.filePaths[0] || null
  })
  handle('ssh:setPassword', (id: string, password: string | null) => setSshPassword(String(id), password == null ? null : String(password)))
  handle('ssh:hasPassword', (id: string) => hasSshPassword(String(id)))
}
