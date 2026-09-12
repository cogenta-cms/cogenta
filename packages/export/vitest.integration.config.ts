import { defineConfig } from 'vitest/config'

// This package has no integration suite yet — the script that runs this file
// exists workspace-wide, and pointing it at a config that was never written
// made `pnpm test:integration` fail with "Cannot resolve entry module"
// rather than pass with nothing to do. `--passWithNoTests` in the script is
// what makes an empty `test/integration` honest instead of an error.
export default defineConfig({
  test: {
    name: 'export:integration',
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
