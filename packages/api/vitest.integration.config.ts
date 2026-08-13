import { defineConfig } from 'vitest/config'

// Integration tests run against the real services from docker-compose.test.yml.
// A service whose URL is unset is skipped with a message — never silently passed.
export default defineConfig({
  test: {
    name: 'api:integration',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
