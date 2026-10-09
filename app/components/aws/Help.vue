<script setup lang="ts">
// Every key the screen in front answers to, and the ones that work anywhere in the window, as
// aws-tui's ? overlay lists them.
import { ACTIONS, AWS_GENERAL } from '#shared/actions'

const A = useAwsStore()
const prefs = usePrefsStore()

const here = computed(() => {
  const out: { id: string; label: string }[] = []
  const seen = new Set<string>()
  // The help sheet's own layer is the one in front; the screen's are behind it.
  for (const l of awsLayers(1)) {
    for (const id of Object.keys(l.keys)) {
      if (seen.has(id)) continue
      seen.add(id)
      const a = ACTIONS.find(x => x.id === id)
      if (a) out.push({ id, label: a.label })
    }
    if (l.modal) break
  }
  return out
})

const anywhere = ['awsNextTab', 'awsPrevTab', 'awsFinder', 'awsProfile', 'awsRegion', 'awsBookmarks', 'awsLock', 'awsDetach', 'awsHelp']
  .map(id => ACTIONS.find(a => a.id === id)!)
  .filter(a => a.g === AWS_GENERAL)

useAwsKeys(() => ({ modal: true, keys: { awsBack: { run: () => { A.help = false } }, awsHelp: { run: () => { A.help = false } } } }))
</script>

<template>
  <AwsDialog title="Keys" :sub="A.term ? 'terminal' : A.tab" width="620px" @close="A.help = false">
    <div class="grid min-h-0 flex-1 grid-cols-2 gap-6 overflow-auto px-5 py-4 text-[12px]">
      <div class="flex flex-col gap-1.5">
        <span class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">On this screen</span>
        <div v-for="k in here" :key="k.id" class="flex items-baseline gap-3">
          <span class="mono w-[110px] flex-none text-(--tx2)">{{ prefs.kl(k.id) }}</span>
          <span class="text-(--tx3)">{{ k.label }}</span>
        </div>
        <span v-if="!here.length" class="text-(--fa)">Nothing more than the keys on the right.</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <span class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-(--fa)">Anywhere</span>
        <div v-for="k in anywhere" :key="k.id" class="flex items-baseline gap-3">
          <span class="mono w-[110px] flex-none text-(--tx2)">{{ prefs.kl(k.id) }}</span>
          <span class="text-(--tx3)">{{ k.label }}</span>
        </div>
        <div class="flex items-baseline gap-3">
          <span class="mono w-[110px] flex-none text-(--tx2)">Esc</span>
          <span class="text-(--tx3)">Back: clear the filter, then up a level</span>
        </div>
        <div class="flex items-baseline gap-3">
          <span class="mono w-[110px] flex-none text-(--tx2)">{{ prefs.kl('aws') }}</span>
          <span class="text-(--tx3)">Close the window</span>
        </div>
      </div>
    </div>
  </AwsDialog>
</template>
