import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@cogenta/widgets',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    // The store suite opens real SQLite files, slow on Windows CI runners.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
