import { defineConfig } from 'vitest/config'

// Unit tests only. Integration tests live in each package under
// `test/integration/**` and run through `pnpm test:integration`, which needs the
// ephemeral services from docker-compose.test.yml.
export default defineConfig({
  test: {
    projects: ['packages/*'],
    include: ['**/test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/test/integration/**'],
    reporters: process.env.CI ? ['default', 'github-actions'] : ['default'],
  },
})
