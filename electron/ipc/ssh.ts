// SSH connections: importing from ~/.ssh/config, key picking and saved passwords.
import { dialog } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { handle, state } from '../context'
import { parseSshConfig } from '../services/ssh'
import { hasSshPassword, setSshPassword } from '../services/sshsecrets'

export function registerSshIpc() {
  handle('ssh:importConfig', () => {
    try {
      return parseSshConfig(fs.readFileSync(path.join(os.homedir(), '.ssh', 'config'), 'utf8'))
    } catch {
      return []
    }
  })
  handle('ssh:pickKey', async () => {
    const r = await dialog.showOpenDialog(state.win!, { defaultPath: path.join(os.homedir(), '.ssh'), properties: ['openFile', 'showHiddenFiles'] })
    return r.canceled ? null : r.filePaths[0] || null
  })
  handle('ssh:setPassword', (id: string, password: string | null) => setSshPassword(String(id), password == null ? null : String(password)))
  handle('ssh:hasPassword', (id: string) => hasSshPassword(String(id)))
}
