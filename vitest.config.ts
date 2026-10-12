import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '#shared': new URL('./shared', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') } },
})
