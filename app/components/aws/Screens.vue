<script setup lang="ts">
// The AWS window's screens: a sidebar of aws-tui's ten services and the AWS CLI sessions running,
// and the service showing. Each service keeps its place (filter, sub-screen) while another shows,
// until the profile or region changes. AWS stays locked behind a TOTP code until it's entered.
import { AWS_TABS, type AwsTab } from '#shared/aws'

const A = useAwsStore()
const AW = useAwsWorldStore()
const prefs = usePrefsStore()

const ICON: Record<AwsTab, string> = {
  'Beanstalk': 'i-hugeicons-rocket-01',
  'EC2': 'i-hugeicons-server-stack-01',
  'RDS': 'i-hugeicons-database',
  'ElastiCache': 'i-hugeicons-zap',
  'Logs': 'i-hugeicons-activity-01',
  'CloudFront': 'i-hugeicons-globe-02',
  'S3': 'i-hugeicons-folder-01',
  'Parameter Store': 'i-hugeicons-key-01',
  'SecurityHub': 'i-hugeicons-shield-01',
  'CodeDeploy': 'i-hugeicons-workflow-square-10',
}

/** Counts from the data centre's read: running instances, and environments that aren't green. */
const counts = computed<Partial<Record<AwsTab, { n: number; hot?: boolean }>>>(() => {
  const w = AW.world
  if (!w) return {}
  const running = w.instances.filter(i => i.state === 'running').length
  const sick = w.envs.filter(e => e.health === 'Red' || e.health === 'Yellow').length
  return {
    EC2: { n: running },
    Beanstalk: sick ? { n: sick, hot: true } : { n: w.envs.length },
  }
})

const ctxKey = computed(() => `${A.profile}|${A.region}`)
const TERM_ICON = { shell: 'i-hugeicons-computer-terminal-01', forward: 'i-hugeicons-plug-01', tail: 'i-hugeicons-activity-01', login: 'i-hugeicons-lock-key' } as const

onMounted(async () => {
  if (!A.ready) await A.init()
  AW.start()
})
onBeforeUnmount(() => AW.stop())
</script>

<template>
  <div class="relative flex min-h-0 flex-1">
    <nav class="flex w-[196px] flex-none flex-col gap-0.5 overflow-auto border-r border-(--ln) bg-(--chrome) p-2">
      <button
        v-for="t in AWS_TABS"
        :key="t"
        class="flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] hover:bg-(--hov)"
        :class="A.tab === t && !A.term ? 'bg-(--hov) font-medium text-(--tx)' : 'text-(--tx2)'"
        @click="A.go(t)"
      >
        <UIcon :name="ICON[t]" class="size-4 flex-none" :class="A.tab === t && !A.term ? 'text-(--tx)' : 'text-(--mu)'" />
        <span class="ellipsis flex-1">{{ t }}</span>
        <span
          v-if="counts[t]?.n"
          class="mono rounded-lg px-1.5 text-[10.5px] font-bold"
          :class="counts[t]!.hot ? 'bg-(--ambf) text-[#131417]' : 'bg-(--chip) text-(--tx2)'"
        >{{ counts[t]!.n }}</span>
      </button>

      <template v-if="A.terms.length">
        <div class="mt-3 px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-(--fa)">Sessions</div>
        <button
          v-for="s in A.terms"
          :key="s.id"
          class="group flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12px] hover:bg-(--hov)"
          :class="A.term === s.id ? 'bg-(--hov) text-(--tx)' : 'text-(--tx2)'"
          :title="s.cmd"
          @click="A.term = s.id"
        >
          <UIcon :name="TERM_ICON[s.kind]" class="size-4 flex-none" :class="s.exited ? 'text-(--fa)' : 'text-(--grn)'" />
          <span class="ellipsis flex-1" :class="s.exited && 'text-(--fa)'">{{ s.title }}</span>
          <UIcon name="i-hugeicons-cancel-01" class="size-3.5 flex-none opacity-0 hover:text-(--red) group-hover:opacity-100" title="End and close" @click.stop="A.closeTerm(s.id)" />
        </button>
      </template>

      <div class="flex-1" />
      <button
        v-if="A.ctx && A.lock?.unlocked"
        class="flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-(--tx2) hover:bg-(--hov)"
        @click="A.bookmarksOpen = true"
      >
        <UIcon name="i-hugeicons-bookmark-02" class="size-4 flex-none text-(--mu)" />
        <span class="flex-1">Bookmarks</span>
        <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('awsBookmarks') }}</span>
      </button>
      <button
        v-if="A.ctx && A.lock?.unlocked"
        class="flex h-8 flex-none cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12px] text-(--tx2) hover:bg-(--hov)"
        @click="A.finder = true"
      >
        <UIcon name="i-hugeicons-search-01" class="size-4 flex-none text-(--mu)" />
        <span class="flex-1">Find</span>
        <span class="mono text-[10.5px] text-(--fa)">{{ prefs.kl('awsFinder') }}</span>
      </button>
    </nav>

    <div v-if="!A.ready" class="grid flex-1 place-items-center text-[12px] text-(--fa)">Reading your AWS profiles…</div>
    <AwsUnlock v-else-if="!A.lock?.unlocked" />
    <div v-else-if="!A.profiles.length" class="min-h-0 flex-1 overflow-auto">
      <div class="mx-auto flex max-w-[520px] flex-col gap-3 px-6 py-12">
        <span class="text-[15px] font-semibold">No AWS profiles yet</span>
        <span class="text-[12px] leading-[1.5] text-(--mu)">Canopy reads the profiles in ~/.aws/config and ~/.aws/credentials, as the AWS CLI and aws-tui do. Add one with <span class="mono text-(--tx2)">aws configure</span> or <span class="mono text-(--tx2)">aws configure sso</span>, then open this window again.</span>
      </div>
    </div>
    <div v-else-if="!A.ctx" class="grid flex-1 place-items-center text-[12px] text-(--fa)">
      <span>Pick a profile <span class="mono text-(--tx2)">({{ prefs.kl('awsProfile') }})</span> to start.</span>
    </div>
    <AwsTerminal v-else-if="A.term" :key="A.term" :id="A.term" />
    <!-- A new profile or region starts every service afresh. -->
    <div v-else :key="ctxKey" class="flex min-h-0 min-w-0 flex-1">
      <KeepAlive>
        <AwsBeanstalk v-if="A.tab === 'Beanstalk'" />
        <AwsEc2 v-else-if="A.tab === 'EC2'" />
        <AwsRds v-else-if="A.tab === 'RDS'" />
        <AwsElastiCache v-else-if="A.tab === 'ElastiCache'" />
        <AwsLogs v-else-if="A.tab === 'Logs'" />
        <AwsCloudFront v-else-if="A.tab === 'CloudFront'" />
        <AwsS3 v-else-if="A.tab === 'S3'" />
        <AwsParams v-else-if="A.tab === 'Parameter Store'" />
        <AwsSecurityHub v-else-if="A.tab === 'SecurityHub'" />
        <AwsCodeDeploy v-else-if="A.tab === 'CodeDeploy'" />
      </KeepAlive>
    </div>

    <AwsPicker v-if="A.picker && A.lock?.unlocked" />
    <AwsFinder v-else-if="A.finder" />
    <AwsBookmarks v-else-if="A.bookmarksOpen" />
    <AwsLinks v-else-if="A.links" />
    <AwsAsk v-if="A.ask" :key="A.ask.title" />
    <AwsHelp v-if="A.help" />
  </div>
</template>
