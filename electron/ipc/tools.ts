// The GitHub, AWS and SSH windows, and the settings the windows share.
import { ipcMain } from 'electron'
import { TOOL_KINDS, type MainCmd, type SharedState, type ToolCmd, type ToolKind } from '../../shared/bridge'
import { broadcast, handle, send, showWindow, trusted } from '../context'
import { hideTool, resetAllTools, resetTool, showTool, toggleTool, toolReady, toolState } from '../tools'

const kindOf = (k: unknown): ToolKind => {
  if (!TOOL_KINDS.includes(k as ToolKind)) throw new Error('Unknown window.')
  return k as ToolKind
}

export function registerToolsIpc() {
  handle('tool:toggle', (kind: ToolKind, strict?: boolean) => toggleTool(kindOf(kind), !!strict))
  handle('tool:open', (kind: ToolKind, cmd?: ToolCmd) => showTool(kindOf(kind), cmd))
  handle('tool:hide', (kind: ToolKind) => hideTool(kindOf(kind)))
  handle('tool:state', () => toolState())
  // Back to the original place, over the main window.
  handle('tool:reset', (kind?: ToolKind) => (kind ? resetTool(kindOf(kind)) : resetAllTools()))
  handle('tool:ready', (kind: ToolKind) => toolReady(kindOf(kind)))
  // Something only the main window can do, such as Settings.
  handle('tool:toMain', (cmd: MainCmd) => {
    showWindow()
    send('app:cmd', cmd)
  })
  // Settings changed in one window reach the others; the main window is the one that saves them.
  ipcMain.on('sync:push', (e, s: SharedState) => {
    if (trusted(e)) broadcast('sync:push', s, e.sender)
  })
  ipcMain.on('sync:request', (e) => {
    if (trusted(e)) send('sync:request')
  })
}
