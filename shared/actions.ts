// Rebindable keyboard actions. Copied from the prototype's ACTIONS list.

export interface ActionDef {
  id: string
  g: string
  label: string
  def: string[]
  /**
   * 'shell' actions only fire while a shell in the dock panel has focus, 'sim' ones only in the
   * workspace simulation, 'github' ones only in the GitHub window; all may reuse keys bound
   * elsewhere, and GitHub window keys may be single letters, like gh-tui's.
   */
  scope?: 'shell' | 'sim' | 'github' | 'aws'
}

const GH = 'GitHub window'
/** The AWS window's keys follow aws-tui's. Each service's group may reuse a key another service uses. */
export const AWS_GENERAL = 'AWS window'
const AW = AWS_GENERAL
const A = (svc: string) => `AWS window: ${svc}`

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
  { id: 'github', g: 'Navigate', label: 'Open or close GitHub', def: ['Ctrl+Shift+G'] },
  { id: 'aws', g: 'Navigate', label: 'Open or close AWS', def: ['Ctrl+Shift+A'] },
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
  { id: 'ghDown', g: GH, label: 'Next item', def: ['J', '↓'], scope: 'github' },
  { id: 'ghUp', g: GH, label: 'Previous item', def: ['K', '↑'], scope: 'github' },
  { id: 'ghOpen', g: GH, label: 'Open the selected item, or go from the sidebar into the section', def: ['Enter', '→', 'L'], scope: 'github' },
  { id: 'ghBack', g: GH, label: 'Back, then out to the sidebar (Esc does the same)', def: ['←', 'Backspace', 'H'], scope: 'github' },
  { id: 'ghNextTab', g: GH, label: 'Next tab of a pull request', def: ['Tab'], scope: 'github' },
  { id: 'ghPrevTab', g: GH, label: 'Previous tab of a pull request', def: ['Shift+Tab'], scope: 'github' },
  { id: 'ghSearch', g: GH, label: 'Search repos', def: ['/'], scope: 'github' },
  { id: 'ghRefresh', g: GH, label: 'Refresh', def: ['Ctrl+F', 'F5'], scope: 'github' },
  { id: 'ghBrowser', g: GH, label: 'Open in the browser', def: ['O'], scope: 'github' },
  { id: 'ghApprove', g: GH, label: 'Approve the pull request', def: ['A'], scope: 'github' },
  { id: 'ghRequestChanges', g: GH, label: 'Request changes', def: ['X'], scope: 'github' },
  { id: 'ghComment', g: GH, label: 'Comment on the pull request', def: ['C'], scope: 'github' },
  { id: 'ghSquash', g: GH, label: 'Squash and merge', def: ['S'], scope: 'github' },
  { id: 'ghMergeCommit', g: GH, label: 'Merge with a merge commit', def: ['M'], scope: 'github' },
  { id: 'ghRebase', g: GH, label: 'Rebase and merge', def: ['R'], scope: 'github' },
  { id: 'ghDeleteBranch', g: GH, label: 'Delete the branch on merge, or not', def: ['D'], scope: 'github' },
  { id: 'ghHide', g: GH, label: 'Hide the repo from GitHub HQ and the GitHub window, or show it again', def: ['Shift+H'], scope: 'github' },
  { id: 'ghRunWorkflow', g: GH, label: 'Run a workflow in the repo', def: ['W'], scope: 'github' },
  { id: 'ghRerun', g: GH, label: 'Re-run the whole workflow run', def: ['Shift+R'], scope: 'github' },
  { id: 'ghRerunFailed', g: GH, label: 'Re-run the failed jobs', def: ['Shift+F'], scope: 'github' },
  { id: 'ghCancel', g: GH, label: 'Cancel the workflow run', def: ['Shift+X'], scope: 'github' },
  { id: 'awsDown', g: AW, label: 'Next row', def: ['J', '↓'], scope: 'aws' },
  { id: 'awsUp', g: AW, label: 'Previous row', def: ['K', '↑'], scope: 'aws' },
  { id: 'awsPageDown', g: AW, label: 'Page down', def: ['PageDown', 'Ctrl+F'], scope: 'aws' },
  { id: 'awsPageUp', g: AW, label: 'Page up', def: ['PageUp', 'Ctrl+B'], scope: 'aws' },
  { id: 'awsTop', g: AW, label: 'First row', def: ['Home', 'G'], scope: 'aws' },
  { id: 'awsBottom', g: AW, label: 'Last row', def: ['End', 'Shift+G'], scope: 'aws' },
  { id: 'awsOpen', g: AW, label: 'Open the selected row', def: ['Enter'], scope: 'aws' },
  { id: 'awsBack', g: AW, label: 'Back: clear the filter, then up a level (Esc does the same)', def: ['Backspace'], scope: 'aws' },
  { id: 'awsNextTab', g: AW, label: 'Next service', def: ['Tab'], scope: 'aws' },
  { id: 'awsPrevTab', g: AW, label: 'Previous service', def: ['Shift+Tab'], scope: 'aws' },
  { id: 'awsRight', g: AW, label: 'Next service, from a service’s main list', def: ['→'], scope: 'aws' },
  { id: 'awsLeft', g: AW, label: 'Previous service, from a service’s main list', def: ['←'], scope: 'aws' },
  { id: 'awsFilter', g: AW, label: 'Filter the list', def: ['/'], scope: 'aws' },
  { id: 'awsSort', g: AW, label: 'Sort by a column', def: ['S'], scope: 'aws' },
  { id: 'awsRefresh', g: AW, label: 'Refresh', def: ['Ctrl+R', 'F5'], scope: 'aws' },
  { id: 'awsHelp', g: AW, label: 'Show every key on this screen', def: ['Shift+/'], scope: 'aws' },
  { id: 'awsFinder', g: AW, label: 'Find anything across services', def: ['Ctrl+K'], scope: 'aws' },
  { id: 'awsProfile', g: AW, label: 'Switch profile', def: ['Ctrl+P'], scope: 'aws' },
  { id: 'awsRegion', g: AW, label: 'Switch region', def: ['Ctrl+G'], scope: 'aws' },
  { id: 'awsLock', g: AW, label: 'Lock AWS (asks for a TOTP code again)', def: ['Ctrl+L'], scope: 'aws' },
  { id: 'awsBookmark', g: AW, label: 'Bookmark the selected row, or remove it', def: ['B'], scope: 'aws' },
  { id: 'awsBookmarks', g: AW, label: 'Bookmarks', def: ['Shift+B'], scope: 'aws' },
  { id: 'awsRelated', g: AW, label: 'Related resources in other services', def: ['O'], scope: 'aws' },
  { id: 'awsCopy', g: AW, label: 'Copy: then a letter for what', def: ['Y'], scope: 'aws' },
  { id: 'awsDetach', g: AW, label: 'Leave a terminal session running and go back', def: ['Ctrl+]'], scope: 'aws' },
  { id: 'awsBookmarkRemove', g: A('Bookmarks'), label: 'Remove the bookmark', def: ['D'], scope: 'aws' },
  { id: 'awsEbEvents', g: A('Beanstalk'), label: 'Environment events', def: ['E'], scope: 'aws' },
  { id: 'awsEbDeploy', g: A('Beanstalk'), label: 'Deploy a version', def: ['D'], scope: 'aws' },
  { id: 'awsEc2Details', g: A('EC2'), label: 'Instance details', def: ['I'], scope: 'aws' },
  { id: 'awsEc2Console', g: A('EC2'), label: 'Console output', def: ['C'], scope: 'aws' },
  { id: 'awsEc2Forward', g: A('EC2'), label: 'Port forward through SSM', def: ['P'], scope: 'aws' },
  { id: 'awsEc2Stop', g: A('EC2'), label: 'Stop the instance', def: ['Shift+S'], scope: 'aws' },
  { id: 'awsEc2Start', g: A('EC2'), label: 'Start the instance', def: ['Shift+U'], scope: 'aws' },
  { id: 'awsEc2Reboot', g: A('EC2'), label: 'Reboot the instance', def: ['Shift+R'], scope: 'aws' },
  { id: 'awsEc2State', g: A('EC2'), label: 'Filter by state', def: ['F'], scope: 'aws' },
  { id: 'awsRdsForward', g: A('RDS'), label: 'Port forward command through a bastion', def: ['F'], scope: 'aws' },
  { id: 'awsEcUpdates', g: A('ElastiCache'), label: 'Service updates for this resource', def: ['U'], scope: 'aws' },
  { id: 'awsEcAllUpdates', g: A('ElastiCache'), label: 'All service updates in the region', def: ['Shift+U'], scope: 'aws' },
  { id: 'awsEcApply', g: A('ElastiCache'), label: 'Apply the service update', def: ['A'], scope: 'aws' },
  { id: 'awsLogTail', g: A('Logs'), label: 'Live tail', def: ['T'], scope: 'aws' },
  { id: 'awsLogTailCli', g: A('Logs'), label: 'Tail in a terminal with aws logs tail', def: ['Shift+T'], scope: 'aws' },
  { id: 'awsLogSearch', g: A('Logs'), label: 'Search the group', def: ['Shift+S'], scope: 'aws' },
  { id: 'awsLogMore', g: A('Logs'), label: 'Load more groups', def: ['M'], scope: 'aws' },
  { id: 'awsLogJson', g: A('Logs'), label: 'Pretty-print JSON lines', def: ['Shift+J'], scope: 'aws' },
  { id: 'awsLogNext', g: A('Logs'), label: 'Next match', def: ['N'], scope: 'aws' },
  { id: 'awsLogPrev', g: A('Logs'), label: 'Previous match', def: ['Shift+N'], scope: 'aws' },
  { id: 'awsLogPause', g: A('Logs'), label: 'Pause or resume the live tail', def: ['P'], scope: 'aws' },
  { id: 'awsLogClear', g: A('Logs'), label: 'Clear the live tail', def: ['C'], scope: 'aws' },
  { id: 'awsCfInvalidate', g: A('CloudFront'), label: 'Create an invalidation', def: ['I'], scope: 'aws' },
  { id: 'awsCfHistory', g: A('CloudFront'), label: 'Invalidation history', def: ['V'], scope: 'aws' },
  { id: 'awsS3Select', g: A('S3'), label: 'Select the file', def: ['Space'], scope: 'aws' },
  { id: 'awsS3Delete', g: A('S3'), label: 'Delete the selected files', def: ['Ctrl+D'], scope: 'aws' },
  { id: 'awsS3Upload', g: A('S3'), label: 'Upload files here', def: ['Ctrl+U'], scope: 'aws' },
  { id: 'awsParamEdit', g: A('Parameter Store'), label: 'Edit the value', def: ['E'], scope: 'aws' },
  { id: 'awsParamNew', g: A('Parameter Store'), label: 'New parameter', def: ['N'], scope: 'aws' },
  { id: 'awsParamReveal', g: A('Parameter Store'), label: 'Reveal or mask a secure value', def: ['R'], scope: 'aws' },
  { id: 'awsParamHistory', g: A('Parameter Store'), label: 'Version history', def: ['H'], scope: 'aws' },
  { id: 'awsParamCopyLine', g: A('Parameter Store'), label: 'Copy the line under the cursor', def: ['Shift+Y'], scope: 'aws' },
  { id: 'awsShAll', g: A('SecurityHub'), label: 'All active findings', def: ['A'], scope: 'aws' },
  { id: 'awsShSuppressed', g: A('SecurityHub'), label: 'Show or hide suppressed findings', def: ['X'], scope: 'aws' },
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

/** Every action of a scope bound to a combo; the AWS window's services reuse keys, so the screen showing picks. */
export function matchActions(keys: Record<string, string[]>, combo: string | null, scope: ActionDef['scope']): string[] {
  if (!combo) return []
  return ACTIONS.filter(x => x.scope === scope && keysOf(keys, x.id).includes(combo)).map(x => x.id)
}

/** Two actions of a scope clash on a key: always, except AWS actions of two different services. */
export function clashes(a: ActionDef, b: ActionDef) {
  if (a.scope !== b.scope) return false
  if (a.scope !== 'aws') return true
  return a.g === b.g || a.g === AWS_GENERAL || b.g === AWS_GENERAL
}

/** Matches a combo against the user's bindings: app-wide ones by default, or those of a scope. */
export function matchAction(keys: Record<string, string[]>, combo: string | null, scope?: ActionDef['scope']): string | null {
  if (!combo) return null
  return ACTIONS.find(x => x.scope === scope && keysOf(keys, x.id).includes(combo))?.id ?? null
}
