<script setup lang="ts">
// Local time and the weather outside, in a card over the workspace simulation.
import { skyOf, useWeather } from '~/composables/useWeather'

const ui = useUiStore()
const { weather } = useWeather()

const sky = computed(() => (weather.value ? skyOf(weather.value.code, weather.value.day) : null))
const now = computed(() => new Date(ui.now))
const time = computed(() => now.value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))
const date = computed(() => now.value.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }))
const deg = (v: number) => `${Math.round(v)}°`
</script>

<template>
  <div class="w-[240px] rounded-xl border border-white/10 bg-black/45 px-3.5 py-3 text-white backdrop-blur">
    <div class="flex items-baseline justify-between gap-2">
      <span class="text-[26px] font-semibold leading-none tabular-nums">{{ time }}</span>
      <span v-if="weather" class="ellipsis text-[11px] text-white/55">{{ weather.place }}</span>
    </div>
    <div class="mt-1 text-[11px] text-white/55">{{ date }}</div>
    <div v-if="weather && sky" class="mt-2.5 flex items-center gap-2.5 border-t border-white/10 pt-2.5">
      <span class="text-[28px] leading-none">{{ sky.icon }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-1.5">
          <span class="text-[18px] font-semibold leading-none">{{ deg(weather.temp) }}</span>
          <span class="ellipsis text-[11.5px] text-white/75">{{ sky.label }}</span>
        </div>
        <div class="mt-1 text-[10.5px] text-white/50">
          H {{ deg(weather.hi) }} · L {{ deg(weather.lo) }} · feels {{ deg(weather.feels) }} · wind {{ Math.round(weather.wind) }} {{ weather.unit }}
        </div>
      </div>
    </div>
  </div>
</template>
