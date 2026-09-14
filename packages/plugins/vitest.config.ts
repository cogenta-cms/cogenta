import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugins',
    // Windows CI runners are several times slower at opening SQLite files and
    // starting worker threads: the 5s/10s defaults time out there on tests
    // that take well under a second locally (seen on queue concurrency and on
    // the isolated plugin worker). Hooks keep their own budget, hence both.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    include: ['test/**/*.test.ts'],
  },
})
