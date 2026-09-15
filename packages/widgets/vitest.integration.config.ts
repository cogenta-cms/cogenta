import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'widgets:integration',
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
