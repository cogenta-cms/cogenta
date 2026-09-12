import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'auth',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    // The recovery-code tests hash ten codes and then compare a wrong one
    // against all ten, which is expensive on purpose — that cost is the
    // feature. Locally they land at 2-3s, close enough to the 5s default that
    // a loaded CI runner tips them over, which is exactly what happened: they
    // timed out on every runner while passing on every developer machine.
    // Raising the bound does not weaken anything; a real hang still fails,
    // just later. Same reason admin (20s), cli (15s) and export (30s) already
    // carry one.
    testTimeout: 20_000,
  },
})
