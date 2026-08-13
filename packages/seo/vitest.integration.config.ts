import { defineConfig } from 'vitest/config'

// The SEO package is pure serialisation: it never opens a socket or a database,
// so it has no integration suite of its own. The config exists because the
// workspace task runs `test:integration` on every package, and a package that
// silently lacks the script is a package nobody notices has stopped running.
export default defineConfig({
  test: {
    name: 'seo:integration',
    include: ['test/integration/**/*.test.ts'],
  },
})
