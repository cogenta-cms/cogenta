import { defineConfig } from 'vitest/config'

// Real calls against each provider's live API — skipped loudly (never silently
// passed) when its API key env var is unset. Unlike Postgres/MySQL/Redis, an LLM
// vendor's API cannot be run locally via docker-compose.test.yml.
export default defineConfig({
  test: {
    name: 'agents:integration',
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
