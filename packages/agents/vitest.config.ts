import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'agents',
    include: ['test/**/*.test.ts'],
    // Seeding the built-in agents writes every declaration and identity file
    // to a real directory, then re-reads them to prove the second run changes
    // nothing. Real files, not slowness — and past 5s on a loaded runner.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    exclude: ['test/integration/**'],
  },
})
