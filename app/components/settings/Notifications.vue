<template>
  <div class="flex flex-col">
    <div class="mb-1 text-[15px] font-semibold">Notifications</div>
    <div class="mb-1 text-[12px] leading-[1.5] text-(--mu)">Windows notifications. Clicking one jumps to the session.</div>
    <SettingsToggle label="When a session needs input" sub="Permission prompts and questions." k="notifyWaiting" />
    <SettingsToggle label="When a session finishes" k="notifyDone" />
    <SettingsToggle label="Skip the session I’m looking at" k="skipViewing" />
    <SettingsToggle label="Play a sound" k="sound" />
    <SettingsToggle label="Do not disturb" sub="Pauses all notifications. Waiting sessions still show in the sidebar." k="dnd" />
  </div>
</template>
