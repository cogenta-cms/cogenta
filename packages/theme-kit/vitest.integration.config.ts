import { defineConfig } from 'vitest/config'

// This package touches no service: it has neither a database connection nor
// secrets (R5, contract D) — the same reasoning `@cogenta/theme-canonical`'s
// own copy of this file gives. It exists so `pnpm test:integration` is
// uniform across packages, and it is expected to find nothing to run.
export default defineConfig({
  test: {
    name: 'theme-kit:integration',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
