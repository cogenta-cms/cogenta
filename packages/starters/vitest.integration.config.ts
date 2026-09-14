import { defineConfig } from 'vitest/config'

// The packs are data plus seeding functions written against the real stores
// of `@cogenta/schema`, `@cogenta/core` and `@cogenta/api`, whose own
// integration suites cover the three databases; the seeding itself is played
// end to end by create-cogenta's scaffold tests. The file exists so
// `pnpm test:integration` is uniform across packages, and it is expected to
// find nothing to run.
export default defineConfig({
  test: {
    name: 'starters:integration',
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
