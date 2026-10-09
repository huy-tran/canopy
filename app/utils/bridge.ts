import type { CanopyApi } from '#shared/bridge'

const noop = () => () => {}
const none = async () => null as any

/** Stand-in used when the renderer is opened in a plain browser (no Electron preload). */
const browserFallback: CanopyApi = {
  state: { load: none, save: none },
  pty: { spawn: async () => ({ pid: 0 }), shell: async () => ({ pid: 0 }), write: () => {}, resize: () => {}, kill: none, buffer: async () => '', onData: noop, onExit: noop },
  session: { onHook: noop, onUsage: noop },
  git: {
    info: async () => ({ exists: false, isRepo: false, branch: '', stack: '' }),
    status: async () => ({ isRepo: false, branch: '', changes: [] }),
    files: async () => [], diff: async () => '', read: async () => '',
    worktreeAdd: async () => { throw new Error('Worktrees need the desktop app.') },
    merge: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    stage: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    unstage: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    commit: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    sync: async () => ({ branch: '', upstream: '', ahead: 0, behind: 0, remote: '' }),
    push: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    prUrl: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    draftMessage: async () => ({ ok: false, text: '', error: 'Needs the desktop app.' }),
  },
  summary: { activity: async () => ({ sessions: [], commits: [] }) },
  claude: { run: async () => ({ ok: false, text: '', error: 'Needs the desktop app.' }) },
  svc: { start: none, stop: none, onData: noop, onStatus: noop },
  history: async () => [],
  usage: none,
  gh: {
    reviews: async () => ({ ok: false, prs: [], error: 'Needs the desktop app.', problem: 'other' }),
    world: async () => ({ repos: [], pulls: [], runs: [], at: Date.now(), error: 'Needs the desktop app.', problem: 'other' }),
    runs: async () => [],
    cachedWorld: none,
    rateLimit: none,
    search: async () => ({ ok: false, pulls: [], error: 'Needs the desktop app.' }),
    pull: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    pullDiff: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    review: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    merge: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    run: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    runLog: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    rerun: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    cancel: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    alerts: async () => [],
    repos: async () => ({ ok: false, repos: [], error: 'Needs the desktop app.' }),
    dispatchables: async () => ({ ok: false, workflows: [], error: 'Needs the desktop app.' }),
    branches: async () => [],
    runWorkflow: async () => ({ ok: false, error: 'Needs the desktop app.' }),
  },
  sys: {
    openExternal: async (u) => { window.open(u, '_blank') }, showInFolder: none, openEditor: async () => ({ ok: false, error: 'Needs the desktop app.' }),
    pickFolder: none, fonts: async () => [], shells: async () => [], info: async () => ({ version: '0.0.0', electron: '-', chromium: '-', node: '-', claudeVersion: '-', claudePath: '-', windows: '-' }),
    saveImage: async (_s, n) => n, copyImage: none, saveImageAs: none, notify: none, onNotifyClick: noop, onNotifyAction: noop,
  },
  win: { minimize: none, toggleMaximize: none, close: none, isMaximized: async () => false, onMaximized: noop, summonKey: async () => true },
  app: { quit: none },
  upd: { check: none, download: none, install: none, state: none, onStatus: noop },
}

export const api: CanopyApi = (typeof window !== 'undefined' && (window as any).canopy) || browserFallback

export const isDesktop = typeof window !== 'undefined' && !!(window as any).canopy
