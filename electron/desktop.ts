// Linux: an AppImage has no installer, so launchers (Super + Space on Omarchy) find neither its entry nor its icon until we add them.
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { logoImage } from './context'

export function registerDesktopEntry() {
  const appImage = process.env.APPIMAGE
  if (process.platform !== 'linux' || !appImage || !app.isPackaged) return
  try {
    const data = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
    const iconDir = path.join(data, 'icons', 'hicolor', '512x512', 'apps')
    fs.mkdirSync(iconDir, { recursive: true })
    fs.writeFileSync(path.join(iconDir, 'canopy.png'), logoImage(512).toPNG())

    const appsDir = path.join(data, 'applications')
    fs.mkdirSync(appsDir, { recursive: true })
    const entry = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Canopy',
      'Comment=Manage your Claude Code sessions',
      `Exec="${appImage}" %U`,
      'Icon=canopy',
      'Terminal=false',
      'Categories=Development;',
      'StartupWMClass=Canopy',
      '',
    ].join('\n')
    const file = path.join(appsDir, 'canopy.desktop')
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== entry) fs.writeFileSync(file, entry)
  } catch {
    // A read-only home or a missing icon only costs the launcher entry.
  }
}
