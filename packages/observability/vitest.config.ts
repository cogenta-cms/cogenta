import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'observability',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
