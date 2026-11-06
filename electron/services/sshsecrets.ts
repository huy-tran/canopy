// Saved SSH passwords and key passphrases, encrypted with the system keychain (Electron safeStorage).
import { safeStorage } from 'electron'
import { sshSecrets } from '../context'

export function setSshPassword(id: string, password: string | null) {
  const all = { ...(sshSecrets.get('pw') || {}) }
  if (password == null || password === '') delete all[id]
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('The system keychain is not available, so the password cannot be saved.')
    all[id] = safeStorage.encryptString(password).toString('base64')
  }
  sshSecrets.set('pw', all)
}

export function hasSshPassword(id: string) {
  return !!sshSecrets.get('pw')?.[id]
}

/** The saved password for a connection, or '' when none (or it cannot be read). */
export function sshPassword(id: string): string {
  const b64 = sshSecrets.get('pw')?.[id]
  if (!b64) return ''
  try {
    return safeStorage.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return ''
  }
}
