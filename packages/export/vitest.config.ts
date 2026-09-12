import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'export',
    include: ['test/**/*.test.ts'],
    // scrypt's deliberately heavy cost parameters (crypto.ts) plus real
    // filesystem I/O for backup/restore tests need more than the 5s default.
    testTimeout: 30_000,
    // `testTimeout` does not cover hooks, which keep their own 10s budget.
    // This suite's `beforeEach` builds two complete sites — schema, tables,
    // seed content — before a single assertion runs, and overran it on CI
    // while the tests themselves sat well inside their thirty seconds.
    hookTimeout: 30_000,
  },
})
