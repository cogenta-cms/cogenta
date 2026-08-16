import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'analytics:integration',
    include: ['test/integration/**/*.test.ts'],
  },
})
