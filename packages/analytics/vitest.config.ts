import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'analytics',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
