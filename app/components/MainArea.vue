<script setup lang="ts">
const ui = useUiStore()
const P = useProjectsStore()
const S = useSessionsStore()
const prefs = usePrefsStore()

const cur = computed(() => P.current)
const isT = computed(() => !!cur.value && cur.value.view !== 'overview')
const ss = computed(() => (cur.value ? S.ofProject(cur.value.id) : []))
const inboxSession = computed(() => (ui.inbox?.sid ? S.byId(ui.inbox.sid) : null))
const inboxHere = computed(() => !!(inboxSession.value && cur.value && inboxSession.value.pid === cur.value.id))
const showTabs = computed(() => isT.value && cur.value!.layout === 'tabs' && ss.value.length > 0 && !inboxHere.value)
const showPanel = computed(() => ui.panelShown)
</script>

<template>
  <div class="flex h-full min-w-0 flex-col">
    <SimulationView v-if="ui.sim" />
    <div v-else-if="!cur" class="grid flex-1 place-items-center">
      <div class="flex flex-col items-center gap-3">
        <span class="text-[14px] font-semibold">No projects yet</span>
        <UButton color="primary" size="md" label="New project" @click="ui.openModal('add')" />
      </div>
    </div>

    <template v-else>
      <ProjectHeader :project="cur" />
      <div v-if="isT" class="relative flex min-h-0 flex-1">
        <div class="flex min-w-0 flex-1 flex-col">
          <InboxBar v-if="ui.inbox" />
          <DevServersBar v-if="cur.repos.length" />
          <div class="flex min-h-0 flex-1" :class="prefs.prefs.panelDock === 'right' ? 'flex-row' : 'flex-col'">
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <SessionTabs v-if="showTabs" :project="cur" />
              <PromptAllBar v-if="ui.bc" />
              <TerminalArea :project="cur" />
            </div>
            <DockPanel v-if="showPanel" />
          </div>
        </div>
      </div>
      <div v-else class="min-h-0 flex-1 overflow-auto">
        <OverviewView />
      </div>
    </template>
  </div>
</template>
