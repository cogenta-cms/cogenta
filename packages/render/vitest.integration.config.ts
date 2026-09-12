import { defineConfig } from 'vitest/config'

// Integration tests run against the real services from docker-compose.test.yml.
// A service whose URL is unset is skipped with a message — never silently passed.
export default defineConfig({
  test: {
    name: 'render:integration',
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
