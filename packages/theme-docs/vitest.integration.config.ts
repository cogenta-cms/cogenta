import { defineConfig } from 'vitest/config'

// The theme touches no service: it has neither a database connection nor
// secrets (R5, contract D). The config exists so `pnpm test:integration` is
// uniform across packages, and it is expected to find nothing to run.
export default defineConfig({
  test: {
    name: 'theme-docs:integration',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
