import { defineConfig } from 'vitest/config'

// The SEO package is pure serialisation: it never opens a socket or a database,
// so it has no integration suite of its own. The config exists because the
// workspace task runs `test:integration` on every package, and a package that
// silently lacks the script is a package nobody notices has stopped running.
export default defineConfig({
  test: {
    name: 'seo:integration',
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
  },
})
