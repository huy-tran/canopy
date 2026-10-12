import { contextBridge, ipcRenderer } from 'electron'
import { AWS_CALLS, type AwsApi, type CanopyApi } from '../shared/bridge'

/** One IPC call. Typed loosely here on purpose: each method it is assigned to carries the real signature from CanopyApi. */
const inv = (ch: string) => (...a: unknown[]): Promise<any> => ipcRenderer.invoke(ch, ...a)

function on(ch: string) {
  return (fn: (...a: any[]) => void) => {
    const h = (_e: unknown, ...a: any[]) => fn(...a)
    ipcRenderer.on(ch, h)
    return () => ipcRenderer.removeListener(ch, h)
  }
}

const api: CanopyApi = {
  state: { load: inv('state:load'), save: inv('state:save') },
  pty: {
    spawn: inv('pty:spawn'),
    shell: inv('pty:shell'),
    write: (id, d) => ipcRenderer.send('pty:write', id, d),
    resize: (id, c, r) => ipcRenderer.send('pty:resize', id, c, r),
    kill: inv('pty:kill'),
    buffer: inv('pty:buffer'),
    onData: on('pty:data'),
    onExit: on('pty:exit'),
  },
  session: { onHook: on('session:hook'), onUsage: on('session:usage') },
  git: {
    info: inv('git:info'),
    status: inv('git:status'),
    files: inv('git:files'),
    diff: inv('git:diff'),
    read: inv('git:read'),
    worktreeAdd: inv('git:worktreeAdd'),
    merge: inv('git:merge'),
    stage: inv('git:stage'),
    unstage: inv('git:unstage'),
    commit: inv('git:commit'),
    sync: inv('git:sync'),
    push: inv('git:push'),
    prUrl: inv('git:prUrl'),
    draftMessage: inv('git:draftMessage'),
  },
  summary: { activity: inv('summary:activity') },
  claude: { run: inv('claude:run') },
  svc: { start: inv('svc:start'), stop: inv('svc:stop'), onData: on('svc:data'), onStatus: on('svc:status') },
  history: inv('history'),
  usage: inv('usage'),
  gh: {
    reviews: inv('gh:reviews'),
    world: inv('gh:world'),
    cachedWorld: inv('gh:cachedWorld'),
    rateLimit: inv('gh:rateLimit'),
    runs: inv('gh:runs'),
    search: inv('gh:search'),
    pull: inv('gh:pull'),
    pullDiff: inv('gh:pullDiff'),
    review: inv('gh:review'),
    merge: inv('gh:merge'),
    run: inv('gh:run'),
    runLog: inv('gh:runLog'),
    rerun: inv('gh:rerun'),
    cancel: inv('gh:cancel'),
    alerts: inv('gh:alerts'),
    repos: inv('gh:repos'),
    dispatchables: inv('gh:dispatchables'),
    branches: inv('gh:branches'),
    runWorkflow: inv('gh:runWorkflow'),
  },
  aws: { ...Object.fromEntries(AWS_CALLS.map(c => [c, inv(`aws:${c}`)])), onTail: on('aws:tail') } as unknown as AwsApi,
  sys: {
    openExternal: inv('sys:openExternal'),
    showInFolder: inv('sys:showInFolder'),
    openEditor: inv('sys:openEditor'),
    pickFolder: inv('sys:pickFolder'),
    fonts: inv('sys:fonts'),
    shells: inv('sys:shells'),
    info: inv('sys:info'),
    metrics: inv('sys:metrics'),
    saveImage: inv('sys:saveImage'),
    copyImage: inv('sys:copyImage'),
    saveImageAs: inv('sys:saveImageAs'),
    notify: inv('sys:notify'),
    onNotifyClick: on('notify:click'),
    onNotifyAction: on('notify:action'),
  },
  win: {
    minimize: inv('win:minimize'),
    toggleMaximize: inv('win:toggleMaximize'),
    close: inv('win:close'),
    isMaximized: inv('win:isMaximized'),
    onMaximized: on('win:maximized'),
    summonKey: inv('win:summonKey'),
  },
  app: { quit: inv('app:quit') },
  upd: {
    check: inv('upd:check'),
    download: inv('upd:download'),
    install: inv('upd:install'),
    state: inv('upd:state'),
    onStatus: on('upd:status'),
  },
}

contextBridge.exposeInMainWorld('canopy', api)
