import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'schema',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
