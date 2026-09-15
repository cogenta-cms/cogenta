import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'channels',
    // These suites open real SQLite files; a Windows CI runner takes several
    // times longer than the 5s/10s defaults to do it (seen on schema).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
})
