import { defineConfig } from 'vitest/config'

// The theme touches no service: it has neither a database connection nor
// secrets (R5, contract D). The config exists so `pnpm test:integration` is
// uniform across packages, and it is expected to find nothing to run.
export default defineConfig({
  test: {
    name: 'theme-magazine:integration',
    include: ['test/integration/**/*.test.ts'],
    // One database, shared by every file here — the services in
    // docker-compose.test.yml are a single Postgres, a single MySQL and a
    // single MariaDB. Each suite drops and recreates its tables in
    // `beforeEach`, so two files running at once delete each other's tables
    // mid-run, which surfaces as "relation cogenta_migrations does not exist"
    // or "current transaction is aborted" in whichever one lost the race —
    // never in the one that caused it.
    //
    // Serial is therefore correctness here, not caution. The alternative is a
    // schema or database per file, which is a bigger change than this suite
    // needs today.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
