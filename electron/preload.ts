import { contextBridge, ipcRenderer } from 'electron'
import { AWS_CALLS, type AwsApi, type CanopyApi } from '../shared/bridge'

const inv = (ch: string) => (...a: unknown[]) => ipcRenderer.invoke(ch, ...a)

function on(ch: string) {
  return (fn: (...a: any[]) => void) => {
    const h = (_e: unknown, ...a: any[]) => fn(...a)
    ipcRenderer.on(ch, h)
    return () => ipcRenderer.removeListener(ch, h)
  }
}

const api: CanopyApi = {
  state: { load: inv('state:load') as any, save: inv('state:save') as any },
  pty: {
    spawn: inv('pty:spawn') as any,
    shell: inv('pty:shell') as any,
    write: (id, d) => ipcRenderer.send('pty:write', id, d),
    resize: (id, c, r) => ipcRenderer.send('pty:resize', id, c, r),
    kill: inv('pty:kill') as any,
    buffer: inv('pty:buffer') as any,
    onData: on('pty:data'),
    onExit: on('pty:exit'),
  },
  session: { onHook: on('session:hook'), onUsage: on('session:usage') },
  git: {
    info: inv('git:info') as any,
    status: inv('git:status') as any,
    files: inv('git:files') as any,
    diff: inv('git:diff') as any,
    read: inv('git:read') as any,
    worktreeAdd: inv('git:worktreeAdd') as any,
    merge: inv('git:merge') as any,
    stage: inv('git:stage') as any,
    unstage: inv('git:unstage') as any,
    commit: inv('git:commit') as any,
    sync: inv('git:sync') as any,
    push: inv('git:push') as any,
    prUrl: inv('git:prUrl') as any,
    draftMessage: inv('git:draftMessage') as any,
  },
  summary: { activity: inv('summary:activity') as any },
  claude: { run: inv('claude:run') as any },
  svc: { start: inv('svc:start') as any, stop: inv('svc:stop') as any, onData: on('svc:data'), onStatus: on('svc:status') },
  history: inv('history') as any,
  usage: inv('usage') as any,
  gh: {
    reviews: inv('gh:reviews') as any,
    world: inv('gh:world') as any,
    cachedWorld: inv('gh:cachedWorld') as any,
    rateLimit: inv('gh:rateLimit') as any,
    runs: inv('gh:runs') as any,
    search: inv('gh:search') as any,
    pull: inv('gh:pull') as any,
    pullDiff: inv('gh:pullDiff') as any,
    review: inv('gh:review') as any,
    merge: inv('gh:merge') as any,
    run: inv('gh:run') as any,
    runLog: inv('gh:runLog') as any,
    rerun: inv('gh:rerun') as any,
    cancel: inv('gh:cancel') as any,
    alerts: inv('gh:alerts') as any,
    repos: inv('gh:repos') as any,
    dispatchables: inv('gh:dispatchables') as any,
    branches: inv('gh:branches') as any,
    runWorkflow: inv('gh:runWorkflow') as any,
  },
  aws: { ...Object.fromEntries(AWS_CALLS.map(c => [c, inv(`aws:${c}`)])), onTail: on('aws:tail') } as unknown as AwsApi,
  sys: {
    openExternal: inv('sys:openExternal') as any,
    showInFolder: inv('sys:showInFolder') as any,
    openEditor: inv('sys:openEditor') as any,
    pickFolder: inv('sys:pickFolder') as any,
    fonts: inv('sys:fonts') as any,
    shells: inv('sys:shells') as any,
    info: inv('sys:info') as any,
    metrics: inv('sys:metrics') as any,
    saveImage: inv('sys:saveImage') as any,
    copyImage: inv('sys:copyImage') as any,
    saveImageAs: inv('sys:saveImageAs') as any,
    notify: inv('sys:notify') as any,
    onNotifyClick: on('notify:click'),
    onNotifyAction: on('notify:action'),
  },
  win: {
    minimize: inv('win:minimize') as any,
    toggleMaximize: inv('win:toggleMaximize') as any,
    close: inv('win:close') as any,
    isMaximized: inv('win:isMaximized') as any,
    onMaximized: on('win:maximized'),
    summonKey: inv('win:summonKey') as any,
  },
  app: { quit: inv('app:quit') as any },
  upd: {
    check: inv('upd:check') as any,
    download: inv('upd:download') as any,
    install: inv('upd:install') as any,
    state: inv('upd:state') as any,
    onStatus: on('upd:status'),
  },
}

contextBridge.exposeInMainWorld('canopy', api)
