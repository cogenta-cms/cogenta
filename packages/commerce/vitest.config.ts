import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'commerce',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
