import { defineConfig } from 'vitest/config'

// Real calls against each provider's live API — skipped loudly (never silently
// passed) when its API key env var is unset. Unlike Postgres/MySQL/Redis, an LLM
// vendor's API cannot be run locally via docker-compose.test.yml.
export default defineConfig({
  test: {
    name: 'agents:integration',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
