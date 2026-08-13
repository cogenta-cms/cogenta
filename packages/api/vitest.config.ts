import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
