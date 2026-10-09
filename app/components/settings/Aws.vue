<script setup lang="ts">
// The AWS window's settings: the TOTP lock it shares with aws-tui, how long an unlock lasts, and dry run.
const prefs = usePrefsStore()
const A = useAwsStore()

const HOURS = [1, 2, 4, 8, 12].map(h => ({ label: `${h}h`, value: h }))
const hours = computed({
  get: () => prefs.prefs.awsUnlockHours || 4,
  set: (v: number) => prefs.set({ awsUnlockHours: v }),
})

// The main process reads these from the saved prefs; check the lock again once they're saved.
watch(() => [prefs.prefs.awsTotp, prefs.prefs.awsDryRun], () => setTimeout(() => A.checkLock(), 600))
</script>

<template>
  <div class="flex flex-col">
    <div class="mb-1 text-[15px] font-semibold">AWS</div>
    <div class="mb-2 text-[12px] leading-[1.5] text-(--mu)">
      The AWS window reads your profiles from ~/.aws, and shares aws-tui's lock, bookmarks, last profile and audit log (~/.aws-tui/audit.log).
    </div>
    <SettingsToggle label="Ask for a TOTP code" sub="AWS stays locked until a code from your authenticator app unlocks it, here and in aws-tui." k="awsTotp" />
    <SettingsRow label="Unlock lasts" sub="How long a code keeps AWS unlocked." wrap>
      <Seg v-model="hours" :items="HOURS" size="lg" />
    </SettingsRow>
    <SettingsToggle label="Dry run" sub="Deploys, restarts, invalidations, parameter saves and S3 changes are only written to the audit log, never sent to AWS." k="awsDryRun" />
  </div>
</template>
