// Rebindable keyboard actions. Copied from the prototype's ACTIONS list.

export interface ActionDef {
  id: string
  g: string
  label: string
  def: string[]
  /** 'shell' actions only fire while a shell in the dock panel has focus, 'sim' ones only in the workspace simulation; both may reuse keys bound elsewhere. */
  scope?: 'shell' | 'sim'
}

export const ACTIONS: ActionDef[] = [
  { id: 'jump', g: 'Navigate', label: 'Jump to a project or session', def: ['Ctrl+Shift+P'] },
  { id: 'commands', g: 'Navigate', label: 'Run a command', def: ['Ctrl+K'] },
  { id: 'nextWaiting', g: 'Navigate', label: 'Next session waiting on you', def: ['Ctrl+Shift+J'] },
  { id: 'inbox', g: 'Navigate', label: 'Open or close the inbox', def: ['Ctrl+Shift+I'] },
  { id: 'nextProject', g: 'Navigate', label: 'Next session, across projects', def: ['Ctrl+Tab'] },
  { id: 'prevProject', g: 'Navigate', label: 'Previous session, across projects', def: ['Ctrl+Shift+Tab'] },
  { id: 'nextSession', g: 'Navigate', label: 'Next session in this project', def: ['Alt+]'] },
  { id: 'prevSession', g: 'Navigate', label: 'Previous session in this project', def: ['Alt+['] },
  { id: 'paneRight', g: 'Navigate', label: 'Focus the pane to the right', def: ['Ctrl+Alt+→'] },
  { id: 'paneLeft', g: 'Navigate', label: 'Focus the pane to the left', def: ['Ctrl+Alt+←'] },
  { id: 'toggleView', g: 'Navigate', label: 'Switch Terminals / Overview', def: ['Ctrl+Shift+O'] },
  { id: 'simulation', g: 'Navigate', label: 'Open or close the 3D World', def: ['Ctrl+Shift+Home'] },
  { id: 'newSession', g: 'Sessions', label: 'New session in the focused repo', def: ['Ctrl+Shift+T'] },
  { id: 'promptAll', g: 'Sessions', label: 'Prompt several sessions at once', def: ['Ctrl+Shift+Enter'] },
  { id: 'share', g: 'Sessions', label: 'Share changes with the other repo', def: ['Ctrl+Shift+H'] },
  { id: 'details', g: 'Sessions', label: 'Session details', def: ['Ctrl+Shift+D'] },
  { id: 'closeTerminal', g: 'Sessions', label: 'Close the active terminal', def: ['Ctrl+W'] },
  { id: 'closeAll', g: 'Sessions', label: 'Close all terminals in this project', def: ['Ctrl+Shift+W'] },
  { id: 'strip', g: 'Sessions', label: 'Show or hide the image strip', def: ['Ctrl+Shift+M'] },
  { id: 'cycleLayout', g: 'Layout', label: 'Cycle layout: tabs, split, grid', def: ['Ctrl+Shift+L'] },
  { id: 'files', g: 'Files and dev servers', label: 'Files and git changes', def: ['Ctrl+Shift+F'] },
  { id: 'editor', g: 'Files and dev servers', label: 'Open the focused repo in your editor', def: ['Ctrl+Shift+E'] },
  { id: 'logs', g: 'Files and dev servers', label: 'Dev server logs', def: ['Ctrl+Shift+S'] },
  { id: 'shell', g: 'Files and dev servers', label: 'Open or close the shell panel', def: ['Ctrl+`'] },
  { id: 'shellNew', g: 'Shell panel, while it has focus', label: 'New shell (default shell)', def: ['Ctrl+T'], scope: 'shell' },
  { id: 'shellNewPick', g: 'Shell panel, while it has focus', label: 'New shell, choosing which', def: ['Ctrl+Shift+T'], scope: 'shell' },
  { id: 'shellNext', g: 'Shell panel, while it has focus', label: 'Next shell tab', def: ['Ctrl+Alt+→'], scope: 'shell' },
  { id: 'shellPrev', g: 'Shell panel, while it has focus', label: 'Previous shell tab', def: ['Ctrl+Alt+←'], scope: 'shell' },
  { id: 'simTalk', g: '3D World', label: 'Open or close the session of the character in view', def: ['Ctrl+Enter'], scope: 'sim' },
  { id: 'newProject', g: 'App', label: 'New project', def: ['Ctrl+Shift+N'] },
  { id: 'settings', g: 'App', label: 'Settings', def: ['Ctrl+,'] },
  { id: 'shortcuts', g: 'App', label: 'Keyboard shortcuts', def: ['Ctrl+/'] },
  { id: 'theme', g: 'App', label: 'Toggle light / dark theme', def: [] },
  { id: 'checkUpdates', g: 'App', label: 'Check for updates', def: [] },
  { id: 'quit', g: 'App', label: 'Quit Canopy', def: ['Ctrl+Q'] },
]

/** Keys Claude Code itself needs. Rejected when recording a shortcut. */
export const RESERVED: Record<string, string> = {
  'Ctrl+C': 'Claude Code uses Ctrl C to cancel.',
  'Ctrl+R': 'Claude Code uses Ctrl R to expand the transcript.',
  'Ctrl+V': 'Ctrl V pastes text and screenshots into Claude.',
  'Ctrl+O': 'Claude Code uses Ctrl O.',
  'Ctrl+T': 'Claude Code uses Ctrl T for its todo list.',
  'Ctrl+B': 'Claude Code uses Ctrl B to background a command.',
  'Ctrl+D': 'Ctrl D exits Claude Code.',
  'Ctrl+L': 'Ctrl L clears the terminal.',
  'Shift+Tab': 'Claude Code uses Shift Tab to switch modes.',
  'Esc': 'Esc interrupts Claude.',
}

const CODE_NAMES: Record<string, string> = {
  Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Slash: '/', Comma: ',', Period: '.', BracketLeft: '[', BracketRight: ']',
  Backquote: '`', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Backslash: '\\', ArrowLeft: '←', ArrowRight: '→',
  ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc', Backspace: 'Backspace', Delete: 'Delete', Home: 'Home',
  End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
}

/** Turns a keydown event into a combo string such as "Ctrl+Shift+P". */
export function comboOf(e: { code?: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
  const c = e.code || ''
  if (/^(Control|Shift|Alt|Meta|OS)/.test(c)) return null
  const k = c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : /^Numpad\d$/.test(c) ? c.slice(6) : CODE_NAMES[c] || (/^F\d+$/.test(c) ? c : '')
  if (!k) return null
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+')
}

export function keysOf(keys: Record<string, string[]>, id: string): string[] {
  const a = ACTIONS.find(x => x.id === id)
  return keys[id] || (a ? a.def : [])
}

/** Matches a combo against the user's bindings: app-wide ones by default, or those of a scope. */
export function matchAction(keys: Record<string, string[]>, combo: string | null, scope?: ActionDef['scope']): string | null {
  if (!combo) return null
  return ACTIONS.find(x => x.scope === scope && keysOf(keys, x.id).includes(combo))?.id ?? null
}
