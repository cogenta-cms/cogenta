import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'agents',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
