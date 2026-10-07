// Canopy renderer: a client-only Nuxt app loaded by Electron.
import { TERM_FONTS } from './shared/fonts'

export default defineNuxtConfig({
  ssr: false,
  modules: ['@nuxt/ui', '@pinia/nuxt'],
  css: ['@xterm/xterm/css/xterm.css', '~/assets/css/main.css'],
  devtools: { enabled: false },
  compatibilityDate: '2026-10-01',
  app: {
    head: { title: 'Canopy', link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] },
  },
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    storageKey: 'canopy-color-mode',
  },
  fonts: {
    families: [
      // Referenced through CSS variables, so register them globally for @nuxt/fonts.
      { name: 'Outfit', provider: 'google', weights: [300, 400, 500, 600, 700], global: true },
      { name: 'Geist', provider: 'google', weights: [500, 600], global: true },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 700], global: true },
      // Terminal fonts offered in Settings, regular and bold.
      ...TERM_FONTS.filter(f => f.name !== 'JetBrains Mono').map(f => ({ ...f, weights: [400, 700], global: true })),
    ],
  },
  icon: {
    serverBundle: false,
    // Also scan .ts so icon names in app.config.ts and utils are bundled for offline use.
    clientBundle: { scan: { globInclude: ['**/*.{vue,ts}'] }, includeCustomCollections: true },
  },
  alias: {
    '#shared': new URL('./shared', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  },
  vite: {
    optimizeDeps: { include: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'] },
  },
})
