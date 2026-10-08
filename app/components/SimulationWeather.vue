<script setup lang="ts">
// Local time and the weather outside, in a card over the workspace simulation. The place is the
// city in the system time zone, found with Open-Meteo's geocoder; the weather is Open-Meteo's too.

type Weather = { place: string; temp: number; feels: number; code: number; day: boolean; wind: number; hi: number; lo: number; unit: string }

const ui = useUiStore()

/** The last reading and when it was taken, kept while the app runs so reopening the view is instant. */
const cache = useState<{ at: number; w: Weather | null } | null>('sim-weather', () => null)
const weather = computed(() => cache.value?.w || null)

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
const fahrenheit = /-US$/.test(Intl.NumberFormat().resolvedOptions().locale)

/** "Australia/Brisbane" is Brisbane; "UTC" and the like are nowhere. */
const city = tz.includes('/') ? tz.split('/').pop()!.replace(/_/g, ' ') : ''

async function load() {
  if (!city || (cache.value && Date.now() - cache.value.at < 15 * 60_000)) return
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`).then(r => r.json())
    const hit = geo?.results?.[0]
    if (!hit) throw new Error('No such place')
    const q = new URLSearchParams({
      latitude: String(hit.latitude),
      longitude: String(hit.longitude),
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '1',
      temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
      wind_speed_unit: fahrenheit ? 'mph' : 'kmh',
    })
    const f = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then(r => r.json())
    const c = f.current
    cache.value = {
      at: Date.now(),
      w: {
        place: hit.name, temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: !!c.is_day,
        wind: c.wind_speed_10m, hi: f.daily.temperature_2m_max[0], lo: f.daily.temperature_2m_min[0], unit: fahrenheit ? 'mph' : 'km/h',
      },
    }
  } catch {
    // Offline or the service is down: the card shows the time alone, and tries again in a few minutes.
    cache.value = { at: Date.now() - 10 * 60_000, w: cache.value?.w || null }
  }
}

onMounted(load)
watch(() => Math.floor(ui.now / 60_000), load)

/** WMO weather codes, as Open-Meteo reports them, to a word and a picture. */
function sky(code: number, day: boolean): [string, string] {
  if (code === 0) return day ? ['Clear', '☀️'] : ['Clear', '🌙']
  if (code <= 2) return day ? ['Partly cloudy', '⛅'] : ['Partly cloudy', '☁️']
  if (code === 3) return ['Overcast', '☁️']
  if (code <= 48) return ['Fog', '🌫️']
  if (code <= 57) return ['Drizzle', '🌦️']
  if (code <= 67) return ['Rain', '🌧️']
  if (code <= 77) return ['Snow', '🌨️']
  if (code <= 82) return ['Showers', '🌦️']
  if (code <= 86) return ['Snow showers', '🌨️']
  return ['Thunderstorm', '⛈️']
}

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
    <div v-if="weather" class="mt-2.5 flex items-center gap-2.5 border-t border-white/10 pt-2.5">
      <span class="text-[28px] leading-none">{{ sky(weather.code, weather.day)[1] }}</span>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-1.5">
          <span class="text-[18px] font-semibold leading-none">{{ deg(weather.temp) }}</span>
          <span class="ellipsis text-[11.5px] text-white/75">{{ sky(weather.code, weather.day)[0] }}</span>
        </div>
        <div class="mt-1 text-[10.5px] text-white/50">
          H {{ deg(weather.hi) }} · L {{ deg(weather.lo) }} · feels {{ deg(weather.feels) }} · wind {{ Math.round(weather.wind) }} {{ weather.unit }}
        </div>
      </div>
    </div>
  </div>
</template>
