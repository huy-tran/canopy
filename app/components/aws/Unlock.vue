<script setup lang="ts">
// AWS locked behind a TOTP code, aws-tui's lock: a code from the authenticator app (or a one-time
// backup code) unlocks both for a few hours. On a first run, enrols a new secret with a QR code
// and hands over ten backup codes.
import type { AwsEnrolment } from '#shared/aws'

const A = useAwsStore()
const AW = useAwsWorldStore()
const ui = useUiStore()
const prefs = usePrefsStore()

const code = ref('')
const error = ref('')
const busy = ref(false)
const waitUntil = ref(0)
const enrol = ref<AwsEnrolment | null>(null)
const backup = ref<string[] | null>(null)
const input = ref<HTMLInputElement | null>(null)

const hours = computed(() => prefs.prefs.awsUnlockHours || 4)
const waiting = computed(() => Math.max(0, Math.ceil((waitUntil.value - ui.now) / 1000)))

onMounted(() => nextTick(() => input.value?.focus()))

async function unlock() {
  if (busy.value || waiting.value || !code.value.trim()) return
  busy.value = true
  const r = await api.aws.unlock(code.value)
  busy.value = false
  code.value = ''
  if (!r.ok) {
    error.value = r.error || 'That code didn’t match.'
    if (r.waitMs) waitUntil.value = Date.now() + r.waitMs
    nextTick(() => input.value?.focus())
    return
  }
  error.value = ''
  await A.checkLock()
  AW.read(true)
}

async function startEnrol() {
  enrol.value = await api.aws.enrolStart()
  nextTick(() => input.value?.focus())
}

async function finishEnrol() {
  if (busy.value || !code.value.trim()) return
  busy.value = true
  const r = await api.aws.enrolFinish(code.value)
  busy.value = false
  code.value = ''
  if (!r.ok) {
    error.value = r.error || 'That code didn’t match.'
    return
  }
  error.value = ''
  backup.value = r.codes || []
}

async function done() {
  backup.value = null
  enrol.value = null
  await A.checkLock()
  AW.read(true)
}

function copyCodes() {
  copyText((backup.value || []).join('\n'), 'Backup codes copied')
}

</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto">
    <div class="mx-auto flex max-w-[440px] flex-col gap-4 px-6 py-12">
      <!-- Backup codes, once, after enrolling -->
      <template v-if="backup">
        <div class="flex flex-col gap-1">
          <span class="text-[15px] font-semibold">Save your backup codes</span>
          <span class="text-[12px] leading-[1.5] text-(--mu)">Each one unlocks AWS once if your phone isn't to hand. You won't see them again.</span>
        </div>
        <div class="mono grid select-text grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-(--ln) bg-(--inp) px-4 py-3 text-[13px]">
          <span v-for="c in backup" :key="c">{{ c }}</span>
        </div>
        <div class="flex gap-2">
          <UButton size="sm" color="neutral" variant="outline" icon="i-hugeicons-copy-01" label="Copy" @click="copyCodes" />
          <UButton size="sm" color="primary" label="I've saved them" @click="done" />
        </div>
      </template>

      <!-- First run: enrol a secret -->
      <template v-else-if="!A.lock?.enrolled">
        <div class="flex flex-col gap-1">
          <span class="text-[15px] font-semibold">Protect AWS with a TOTP code</span>
          <span class="text-[12px] leading-[1.5] text-(--mu)">As in aws-tui: a code from your authenticator app unlocks AWS for {{ hours }} hours, in Canopy and aws-tui alike. You can turn this off in Settings › AWS.</span>
        </div>
        <div v-if="!enrol"><UButton size="sm" color="primary" label="Set up" @click="startEnrol" /></div>
        <template v-else>
          <img :src="enrol.qr" alt="QR code for your authenticator app" class="h-[200px] w-[200px] self-center rounded-md bg-white p-2">
          <div class="flex flex-col gap-1">
            <span class="text-[12px] text-(--mu)">Scan it with Google Authenticator, 1Password or Authy, or enter this secret:</span>
            <span class="mono select-text break-all text-[12.5px] text-(--tx)">{{ enrol.secret }}</span>
          </div>
          <div class="flex items-center gap-2">
            <input
              ref="input"
              v-model="code"
              inputmode="numeric"
              maxlength="6"
              placeholder="6-digit code"
              class="mono h-[32px] w-[160px] rounded-md border border-(--ln) bg-(--inp) px-3 text-[14px] tracking-widest text-(--tx) outline-none focus:border-(--lnk)"
              @keydown.enter="finishEnrol"
            >
            <UButton size="sm" color="primary" label="Confirm" :loading="busy" @click="finishEnrol" />
          </div>
        </template>
        <span v-if="error" class="text-[12px] text-(--red)">{{ error }}</span>
      </template>

      <!-- Locked -->
      <template v-else>
        <div class="flex flex-col items-start gap-1">
          <UIcon name="i-hugeicons-lock-key" class="mb-1 size-6 text-(--mu)" />
          <span class="text-[15px] font-semibold">AWS is locked</span>
          <span class="text-[12px] leading-[1.5] text-(--mu)">Enter the code from your authenticator app, or a backup code. It unlocks AWS for {{ hours }} hours here and in aws-tui.</span>
        </div>
        <div class="flex items-center gap-2">
          <input
            ref="input"
            v-model="code"
            maxlength="11"
            placeholder="123456"
            :disabled="!!waiting"
            class="mono h-[32px] w-[180px] rounded-md border border-(--ln) bg-(--inp) px-3 text-[14px] tracking-widest text-(--tx) outline-none focus:border-(--lnk) disabled:opacity-50"
            @keydown.enter="unlock"
          >
          <UButton size="sm" color="primary" label="Unlock" :loading="busy" :disabled="!!waiting" @click="unlock" />
        </div>
        <span v-if="error" class="text-[12px] text-(--red)">{{ error }}<template v-if="waiting"> Try again in {{ waiting }}s.</template></span>
      </template>
    </div>
  </div>
</template>
