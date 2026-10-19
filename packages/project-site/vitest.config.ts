import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'project-site',
    include: ['test/**/*.test.ts'],
    // Rendering every seeded page through a real theme took over the 5s default
    // on a Windows CI runner; the work is real, not slack.
    testTimeout: 30_000,
  },
})
