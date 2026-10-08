<script setup lang="ts">
const prefs = usePrefsStore()

const REMIND = [
  { label: 'Off', value: 0 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
]

const remind = computed({
  get: () => prefs.prefs.reviewRemind,
  set: (v: number) => prefs.set({ reviewRemind: v }),
})
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-1 text-[15px] font-semibold">Notifications</div>
    <div class="mb-1 text-[12px] leading-[1.5] text-(--mu)">Windows notifications. Clicking one jumps to the session.</div>
    <SettingsToggle label="When a session needs input" sub="Permission prompts and questions." k="notifyWaiting" />
    <SettingsToggle label="When a session finishes" k="notifyDone" />
    <SettingsToggle label="Skip the session I’m looking at" k="skipViewing" />
    <SettingsToggle label="When someone requests my review" sub="Pull requests on GitHub, checked every 5 minutes with the gh CLI. Clicking opens the GitHub view." k="reviewNotify" />
    <SettingsRow label="Remind me about waiting reviews" sub="Repeats while any pull request is still waiting for your review." wrap>
      <Seg v-model="remind" :items="REMIND" size="lg" />
    </SettingsRow>
    <SettingsToggle label="Play a sound" k="sound" />
    <SettingsToggle label="Do not disturb" sub="Pauses all notifications. Waiting sessions still show in the sidebar." k="dnd" />
  </div>
</template>
