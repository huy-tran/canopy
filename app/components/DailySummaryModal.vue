<script setup lang="ts">
// What Claude did in a project on a given day, from its session logs and git, plus a plain-English recap
// written by Claude in timesheet form ("[Project - Topic]" then "- " bullets).
import type { DayCommit, DaySession } from '#shared/types'

const ui = useUiStore()
const P = useProjectsStore()

const open = computed({
  get: () => !!ui.summary,
  set: (v: boolean) => { if (!v) ui.summary = null },
})
const project = computed(() => (ui.summary ? P.byId(ui.summary.pid) : null))

// ---------- Day picker: today and the six days before ----------
const DAY = 86_400_000
function midnight(offset: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime() - offset * DAY
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const days = computed(() => Array.from({ length: 7 }, (_, i) => {
  const t = midnight(i)
  return { value: i, label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${WD[new Date(t).getDay()]} ${new Date(t).getDate()}` }
}))
const offset = ref(0)
const since = computed(() => midnight(offset.value))
const until = computed(() => since.value + DAY)

// ---------- Activity ----------
const loading = ref(false)
const sessions = ref<DaySession[]>([])
const commits = ref<DayCommit[]>([])

async function load() {
  const p = project.value
  if (!p) return
  loading.value = true
  try {
    const r = await api.summary.activity(p.repos.map(x => ({ id: x.id, path: x.path })), since.value, until.value)
    sessions.value = r.sessions
    commits.value = r.commits
  } finally {
    loading.value = false
  }
}

watch([open, offset], ([o]) => { if (o) load() }, { immediate: true })
watch(() => ui.summary?.pid, () => { offset.value = 0 })

const repos = computed(() => (project.value?.repos || []).map(r => ({
  ...r,
  sessions: sessions.value.filter(s => s.repoId === r.id),
  commits: commits.value.filter(c => c.repoId === r.id),
})).filter(r => r.sessions.length || r.commits.length))

const totals = computed(() => {
  const files = new Set(sessions.value.flatMap(s => s.files.map(f => `${s.repoId}:${f}`)))
  return {
    sessions: sessions.value.length,
    prompts: sessions.value.reduce((a, s) => a + s.prompts.length, 0),
    files: files.size,
    commits: commits.value.length,
    cost: sessions.value.reduce((a, s) => a + s.cost, 0),
  }
})
const empty = computed(() => !loading.value && !sessions.value.length && !commits.value.length)

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const span = (s: DaySession) => `${clock(s.start)}-${clock(s.end)}`

// ---------- Recap ----------
const key = computed(() => `${ui.summary?.pid}:${since.value}`)
const recap = computed({
  get: () => ui.recaps[key.value] || '',
  set: (v: string) => { ui.recaps = { ...ui.recaps, [key.value]: v } },
})
const writing = ref(false)
const recapError = ref('')

// ---------- Hours: measured active time, Claude's estimate, and the value for the timesheet ----------
const quarter = (h: number) => Math.round(h * 4) / 4
const hrs = (h: number) => `${h}h`

/** Active time across all sessions, counting overlapping sessions once. */
const measured = computed(() => {
  let ms = 0, cur: [number, number] | null = null
  for (const [a, b] of sessions.value.flatMap(s => s.spans).sort((x, y) => x[0] - y[0])) {
    if (cur && a <= cur[1]) cur[1] = Math.max(cur[1], b)
    else {
      if (cur) ms += cur[1] - cur[0]
      cur = [a, b]
    }
  }
  if (cur) ms += cur[1] - cur[0]
  return quarter(ms / 3_600_000)
})
const estimate = computed(() => ui.recapHours[key.value]?.estimate)
const hours = computed({
  get: () => ui.recapHours[key.value]?.hours ?? String(measured.value),
  set: (v: string) => { ui.recapHours = { ...ui.recapHours, [key.value]: { ...ui.recapHours[key.value], hours: v } } },
})

function clip(t: string, n: number) {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}

/** The day's activity as plain text for Claude, kept to a sensible size. */
function activityText() {
  const out: string[] = []
  for (const r of repos.value) {
    out.push(`## ${r.label} (${r.path})`)
    for (const s of r.sessions) {
      out.push(`Session ${span(s)}${s.branch ? ` on ${s.branch}` : ''}`)
      s.prompts.slice(0, 12).forEach(p => out.push(`- Asked: ${clip(p.t, 300)}`))
      if (s.files.length) out.push(`- Files changed: ${s.files.slice(0, 25).join(', ')}${s.files.length > 25 ? ` and ${s.files.length - 25} more` : ''}`)
      if (s.lastReply) out.push(`- Claude's last reply: ${clip(s.lastReply, 800)}`)
    }
    for (const c of r.commits) out.push(`- Commit: ${c.subject}`)
    out.push('')
  }
  return out.join('\n')
}

async function writeRecap() {
  const p = project.value
  if (!p || empty.value) return
  writing.value = true
  recapError.value = ''
  const day = days.value.find(d => d.value === offset.value)!.label
  const prompt = [
    `Write a short recap of the work done on the "${p.name}" project (${day.toLowerCase()}), for a timesheet entry the client will read.`,
    `Format: the first line is a context tag in square brackets, "[${p.name} - <Topic>]", where Topic names the main area of work in two to four words.`,
    'Then one bullet per distinct piece of work, each starting with "- " (a single hyphen and a space).',
    'Write for a non-technical reader: describe the outcome and what users or the client can now do or see, not the implementation.',
    'Merge small related steps into one bullet. Leave out failed attempts, tooling chatter and anything not finished unless it is clearly in progress.',
    'Never use em dashes or en dashes; use a plain hyphen.',
    'After the bullets, add one last line "Hours: <n>": your estimate of how many hours a mid-level developer would take to do this work, rounded to the nearest 0.25.',
    'Reply with the recap and the hours line only.',
    '',
    'Activity:',
    activityText(),
  ].join('\n')
  try {
    const r = await api.claude.run(prompt)
    if (r.ok) {
      const HOURS = /^\s*Hours:\s*([\d.]+)\s*h?\s*$/im
      const est = Number(r.text.match(HOURS)?.[1])
      recap.value = r.text.replace(HOURS, '').trim()
      if (est > 0) ui.recapHours = { ...ui.recapHours, [key.value]: { ...ui.recapHours[key.value], estimate: quarter(est) } }
    } else recapError.value = r.error || 'Claude could not write the recap.'
  } finally {
    writing.value = false
  }
}

function copyRecap() {
  navigator.clipboard.writeText(recap.value).catch(() => {})
  ui.toast({ title: 'Recap copied', body: 'Paste it into your timesheet or client update.' })
}
</script>

<template>
  <UModal
    v-model:open="open"
    scrollable
    :close="false"
    :ui="{
      overlay: 'bg-(--ovl) place-items-[start_center] p-[36px_16px] sm:p-[36px_16px]',
      content: 'w-full max-w-[760px] bg-(--modal) border border-(--bb) rounded-xl shadow-(--shadow) ring-0 divide-y-0 text-(--tx)',
    }"
  >
    <template #content>
      <div v-if="project" class="flex flex-col">
        <div class="flex items-center gap-3 border-b border-(--ln) px-5 py-4">
          <span class="size-2.5 flex-none rounded-sm" :style="{ background: pcol(project.hue) }" />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-[15px] font-semibold">Daily summary</span>
            <span class="ellipsis text-[12px] text-(--mu)">{{ project.name }} · from Claude Code's session logs and git</span>
          </div>
          <UButton color="neutral" variant="ghost" class="size-6 justify-center p-0" @click="open = false">
            <UIcon name="i-hugeicons-cancel-01" class="size-3.5" />
          </UButton>
        </div>

        <div class="flex flex-col gap-4 px-5 py-4">
          <Seg v-model="offset" :items="days" size="lg" />

          <!-- Recap -->
          <div class="flex flex-col gap-2.5 rounded-lg border border-(--ln) bg-(--chrome) p-3.5">
            <div class="flex items-center gap-2">
              <span class="label-caps flex-1">Recap</span>
              <template v-if="recap">
                <UButton color="neutral" variant="outline" size="xs" label="Rewrite" :loading="writing" :disabled="writing || empty" @click="writeRecap" />
                <UButton color="primary" size="xs" label="Copy" @click="copyRecap" />
              </template>
            </div>
            <UTextarea
              v-if="recap"
              v-model="recap"
              autoresize
              :rows="4"
              :maxrows="16"
              variant="none"
              :ui="{ base: 'w-full rounded-md border border-(--ln) bg-(--inp) px-3 py-2 text-[12.5px] leading-[1.55] text-(--tx)' }"
            />
            <div v-else class="flex items-center gap-3">
              <span class="flex-1 text-[12px] leading-[1.5] text-(--mu)">
                A plain-English recap for your timesheet or a client update, written by Claude from this day's activity.
              </span>
              <UButton color="primary" size="sm" :loading="writing" :disabled="writing || loading || empty" :label="writing ? 'Writing…' : 'Write recap'" @click="writeRecap" />
            </div>
            <span v-if="recapError" class="text-[11.5px] text-(--red)">{{ recapError }}</span>
            <div v-if="!loading && !empty" class="flex items-center gap-2.5 border-t border-(--ln2) pt-2.5">
              <span class="label-caps">Hours</span>
              <UInput
                v-model="hours"
                variant="none"
                inputmode="decimal"
                class="w-20"
                :ui="{ base: 'mono w-full rounded-md border border-(--ln) bg-(--inp) px-2 py-1 text-[12.5px] text-(--tx)' }"
              />
              <span class="flex-1" />
              <UTooltip text="Time you were active in Claude Code, ignoring breaks over 15 minutes">
                <UButton color="neutral" variant="ghost" size="xs" :label="`Active ${hrs(measured)}`" @click="hours = String(measured)" />
              </UTooltip>
              <UTooltip v-if="estimate !== undefined" text="Claude's estimate of how long a mid-level developer would take">
                <UButton color="neutral" variant="ghost" size="xs" :label="`Estimate ${hrs(estimate)}`" @click="hours = String(estimate)" />
              </UTooltip>
            </div>
          </div>

          <!-- Activity -->
          <div class="flex flex-col gap-3">
            <div class="flex items-baseline gap-3">
              <span class="label-caps">Activity</span>
              <span v-if="!empty && !loading" class="text-[12px] text-(--mu)">
                {{ plural(totals.sessions, 'session') }} · {{ plural(totals.prompts, 'prompt') }} · {{ plural(totals.files, 'file') }} changed · {{ plural(totals.commits, 'commit') }} · <span class="mono">{{ usd(totals.cost) }}</span>
              </span>
            </div>
            <div v-if="loading" class="text-[12px] text-(--fa)">Reading session logs…</div>
            <div v-else-if="empty" class="text-[12px] text-(--fa)">No Claude Code activity or commits on this day.</div>

            <div v-for="r in repos" :key="r.id" class="flex flex-col gap-2 border-t border-(--ln2) pt-3">
              <div class="flex items-center gap-2">
                <span class="chip-repo">{{ r.label }}</span>
                <span class="mono ellipsis flex-1 text-[11px] text-(--mu)">{{ r.path }}</span>
              </div>
              <div v-for="s in r.sessions" :key="s.claudeId" class="flex flex-col gap-1 pl-1">
                <div class="flex items-center gap-2 text-[11.5px] text-(--tx3)">
                  <span class="mono">{{ span(s) }}</span>
                  <span v-if="s.branch" class="mono text-(--vio)">⎇ {{ s.branch }}</span>
                  <span class="flex-1" />
                  <span class="mono text-(--fa)">{{ usd(s.cost) }}</span>
                </div>
                <div v-for="(p, i) in s.prompts.slice(0, 4)" :key="i" class="ellipsis text-[12.5px] text-(--tx2)">
                  <span class="text-(--fa)">›</span> {{ p.t }}
                </div>
                <div v-if="s.prompts.length > 4" class="text-[11.5px] text-(--fa)">and {{ s.prompts.length - 4 }} more prompts</div>
                <div v-if="s.files.length" class="mono text-[11px] leading-[1.6] text-(--amb)">
                  {{ s.files.slice(0, 8).join('  ') }}<span v-if="s.files.length > 8" class="text-(--fa)">  +{{ s.files.length - 8 }} more</span>
                </div>
              </div>
              <div v-for="c in r.commits" :key="c.hash" class="flex items-center gap-2 pl-1 text-[12px]">
                <span class="mono text-[11px] text-(--fa)">{{ c.hash }}</span>
                <span class="ellipsis flex-1 text-(--tx2)">{{ c.subject }}</span>
                <span class="mono text-[11px] text-(--grn)">+{{ c.ins }}</span>
                <span class="mono text-[11px] text-(--red)">−{{ c.del }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
