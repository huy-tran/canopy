// The weather outside, for the workspace simulation's card and sky. The place is the city set in
// Settings, or else the city in the system time zone; Open-Meteo finds it and reports its weather.

export type Weather = {
  place: string
  temp: number
  feels: number
  /** A WMO weather code, as Open-Meteo reports it. */
  code: number
  day: boolean
  wind: number
  hi: number
  lo: number
  unit: string
  /** Today's sunrise and sunset, in hours since local midnight. */
  sunrise: number
  sunset: number
}

/** What the sky is doing, for the simulation to draw. */
export type Sky = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''

/** The city in the system time zone: "Australia/Brisbane" is Brisbane, "UTC" and the like are nowhere. */
export const zoneCity = tz.includes('/') ? tz.split('/').pop()!.replace(/_/g, ' ') : ''

/** WMO weather codes to a word, a picture and what the simulation's sky does. */
export function skyOf(code: number, day: boolean): { label: string; icon: string; sky: Sky } {
  if (code === 0) return { label: 'Clear', icon: day ? '☀️' : '🌙', sky: 'clear' }
  if (code <= 2) return { label: 'Partly cloudy', icon: day ? '⛅' : '☁️', sky: 'clear' }
  if (code === 3) return { label: 'Overcast', icon: '☁️', sky: 'cloudy' }
  if (code <= 48) return { label: 'Fog', icon: '🌫️', sky: 'fog' }
  if (code <= 57) return { label: 'Drizzle', icon: '🌦️', sky: 'rain' }
  if (code <= 67) return { label: 'Rain', icon: '🌧️', sky: 'rain' }
  if (code <= 77) return { label: 'Snow', icon: '🌨️', sky: 'snow' }
  if (code <= 82) return { label: 'Showers', icon: '🌦️', sky: 'rain' }
  if (code <= 86) return { label: 'Snow showers', icon: '🌨️', sky: 'snow' }
  return { label: 'Thunderstorm', icon: '⛈️', sky: 'storm' }
}

/** "2026-10-08T05:21" to hours since midnight: 5.35. */
const hoursOf = (iso: string | undefined, fallback: number) => {
  const m = /T(\d\d):(\d\d)/.exec(iso || '')
  return m ? Number(m[1]) + Number(m[2]) / 60 : fallback
}

/** One request at a time, shared by the card and the sky. */
let inflight: Promise<void> | null = null

export function useWeather() {
  const ui = useUiStore()
  const prefs = usePrefsStore()
  /** The last reading, which place it was for and when, kept while the app runs so reopening the view is instant. */
  const cache = useState<{ at: number; city: string; w: Weather | null } | null>('sim-weather', () => null)
  const city = computed(() => prefs.prefs.weatherCity?.trim() || zoneCity)

  function load() {
    inflight ??= fetchWeather().finally(() => { inflight = null })
    return inflight
  }

  async function fetchWeather() {
    const want = city.value
    const c0 = cache.value
    if (!want || (c0 && c0.city === want && Date.now() - c0.at < 15 * 60_000)) return
    try {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(want)}&count=1&language=en&format=json`).then(r => r.json())
      const hit = geo?.results?.[0]
      if (!hit) throw new Error('No such place')
      const q = new URLSearchParams({
        latitude: String(hit.latitude),
        longitude: String(hit.longitude),
        current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset',
        timezone: 'auto',
        forecast_days: '1',
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
      })
      const f = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`).then(r => r.json())
      const c = f.current
      cache.value = {
        at: Date.now(),
        city: want,
        w: {
          place: hit.name, temp: c.temperature_2m, feels: c.apparent_temperature, code: c.weather_code, day: !!c.is_day,
          wind: c.wind_speed_10m, hi: f.daily.temperature_2m_max[0], lo: f.daily.temperature_2m_min[0], unit: 'km/h',
          sunrise: hoursOf(f.daily.sunrise?.[0], 6), sunset: hoursOf(f.daily.sunset?.[0], 18),
        },
      }
    } catch {
      // Offline, the service is down or no such place: keep what we had and try again in a few minutes.
      cache.value = { at: Date.now() - 10 * 60_000, city: want, w: c0?.city === want ? c0.w : null }
    }
  }

  onMounted(load)
  watch([() => Math.floor(ui.now / 60_000), city], load)

  return { weather: computed(() => cache.value?.w || null), city }
}
