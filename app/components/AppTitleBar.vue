<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const ui = useUiStore()
const prefs = usePrefsStore()
const appConfig = useAppConfig()

const maximized = ref(false)
onMounted(async () => {
  maximized.value = await api.win.isMaximized()
  api.win.onMaximized((v) => { maximized.value = v })
})

const updReady = computed(() => ui.upd?.status === 'ready')
const updDownloading = computed(() => ui.upd?.status === 'downloading')

const themes = [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']] as const

async function versionInfo() {
  const i = await api.sys.info()
  return `Canopy ${i.version} · Electron ${i.electron} · Claude Code ${i.claudeVersion}`
}

async function releaseNotes() {
  const url = (appConfig.canopy as any)?.releaseNotesUrl
  if (url) api.sys.openExternal(url)
  else ui.toast({ title: 'Release notes', body: (await versionInfo()) })
}

async function reportIssue() {
  const info = await versionInfo()
  navigator.clipboard.writeText(info).catch(() => {})
  const url = (appConfig.canopy as any)?.issuesUrl
  if (url) api.sys.openExternal(url)
  ui.toast({ title: 'Opening the issue tracker', body: 'Version info is copied to your clipboard.' })
}

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'New project…', kbds: [prefs.kl('newProject')], onSelect: () => ui.openModal('add') },
    { label: 'Command palette', kbds: [prefs.kl('commands')], onSelect: () => ui.openPalette('cmd') },
    { label: 'Settings…', kbds: [prefs.kl('settings')], onSelect: () => ui.openSettings('general') },
    { label: 'Keyboard shortcuts…', kbds: [prefs.kl('shortcuts')], onSelect: () => ui.openSettings('keys') },
  ],
  [{ label: 'Theme', slot: 'theme' as const, onSelect: (e: Event) => e.preventDefault() }],
  [
    updReady.value
      ? { label: `Restart to update to ${ui.upd?.version || ''}`.trim(), class: 'text-(--blue)', onSelect: () => api.upd.install() }
      : updDownloading.value
        ? { label: `Downloading update… ${Math.round(ui.upd?.pct || 0)}%`, onSelect: () => { ui.updOpen = true } }
        : { label: 'Check for updates…', onSelect: () => ui.checkUpdates() },
    { label: 'Release notes', onSelect: releaseNotes },
    { label: 'Report an issue…', onSelect: reportIssue },
    { label: 'About Canopy', onSelect: () => { ui.about = true } },
  ],
  [{ label: 'Quit', kbds: [prefs.kl('quit')], onSelect: () => ui.quitApp() }],
])
</script>

<template>
  <div class="drag flex h-[34px] flex-none items-center gap-3 border-b border-(--ln) bg-(--chrome) pl-3">
    <div class="no-drag flex flex-none items-center">
      <UDropdownMenu :items="items" :content="{ align: 'start', sideOffset: 4 }" :ui="{ content: 'w-[280px] p-[5px] rounded-lg', itemTrailingKbds: 'font-[family-name:var(--mono)] text-[10.5px] text-(--fa)' }">
        <button
          title="Menu"
          class="relative z-[47] -ml-[7px] flex h-6 cursor-pointer items-center gap-2 rounded-md px-[7px] hover:bg-(--hov) data-[state=open]:bg-(--hov)"
        >
          <span class="relative flex flex-none">
            <BrandMark :size="16" simple />
            <span v-if="updReady" class="absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-(--chrome) bg-(--blue)" />
          </span>
          <span v-if="ui.wide" class="font-brand text-[12px] font-medium text-(--tx2)">Canopy</span>
          <UIcon name="i-hugeicons-arrow-down-01" class="size-3 text-(--fa)" />
        </button>
        <template #item-trailing="{ item }">
          <span v-if="item.kbds?.[0]" class="mono whitespace-nowrap text-[10.5px] text-(--fa)">{{ item.kbds[0] }}</span>
        </template>
        <template #theme>
          <div class="flex w-full items-center gap-2.5" @click.stop>
            <span class="flex-1 text-[12.5px] text-(--tx)">Theme</span>
            <div class="flex gap-[2px] rounded-lg border border-(--ln) bg-(--seg) p-[2px] text-[11px]">
              <span
                v-for="t in themes"
                :key="t[0]"
                class="flex h-5 cursor-pointer items-center rounded-sm px-2"
                :style="{ background: prefs.theme === t[0] ? 'var(--segon)' : 'transparent', color: prefs.theme === t[0] ? 'var(--tx)' : 'var(--mu)' }"
                @click="prefs.theme = t[0]"
              >{{ t[1] }}</span>
            </div>
          </div>
        </template>
      </UDropdownMenu>
      <div v-if="ui.wide" class="w-[110px]" />
    </div>

    <div class="flex min-w-0 flex-1 justify-center">
      <div
        class="no-drag box-border flex h-[22px] w-full max-w-[400px] cursor-pointer items-center justify-between gap-2 rounded-md border border-(--ln) bg-(--bg) px-2 text-[11.5px] text-(--fa) hover:border-(--bb)"
        @click="ui.openPalette('nav')"
      >
        <span class="ellipsis">Jump to project or session…</span>
        <span class="mono whitespace-nowrap text-[10.5px]">{{ prefs.kl('jump') }}</span>
      </div>
    </div>

    <div
      :title="`Workspace simulation (${prefs.kl('simulation')})`"
      class="no-drag box-border flex h-[22px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11.5px] hover:border-(--bb) hover:text-(--tx2)"
      :class="ui.sim ? 'border-(--bb) bg-(--hov) text-(--tx2)' : 'border-(--ln) text-(--fa)'"
      @click.stop="ui.sim = !ui.sim"
    >
      <UIcon name="i-hugeicons-cube" class="size-3.5" />Workspace
    </div>

    <div
      :title="`Run a command (${prefs.kl('commands')})`"
      class="no-drag box-border flex h-[22px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-(--ln) px-2 text-[11.5px] text-(--fa) hover:border-(--bb) hover:text-(--tx2)"
      @click.stop="ui.openPalette('cmd')"
    >
      Commands<span class="mono text-[10.5px]">{{ prefs.kl('commands') }}</span>
    </div>

    <div class="no-drag flex flex-none text-[12px] text-(--tx3)">
      <div class="grid h-[34px] w-[46px] place-items-center hover:bg-(--hov)" @click="api.win.minimize()">
        <UIcon name="i-hugeicons-minus-sign" class="size-3.5" />
      </div>
      <div class="grid h-[34px] w-[46px] place-items-center hover:bg-(--hov)" @click="api.win.toggleMaximize()"><UIcon :name="maximized ? 'i-hugeicons-copy-02' : 'i-hugeicons-square'" class="size-3" /></div>
      <div class="grid h-[34px] w-[46px] place-items-center hover:bg-[#C42B1C] hover:text-white" @click="api.win.close()"><UIcon name="i-hugeicons-cancel-01" class="size-3.5" /></div>
    </div>
  </div>
</template>
