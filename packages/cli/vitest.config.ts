import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'cli',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    // These tests spawn a real server and do real file I/O (no mocking, per
    // AGENTS.md) — Vitest's 5000ms default is comfortable on Linux/macOS CI
    // but has been observed timing out real, correctly-completing operations
    // on windows-latest runners, which are consistently slower at process
    // and filesystem work. This is headroom for real CI slowness, not a
    // mask for a hang: a genuinely stuck test still fails, just later.
    // Every `serve-*` suite boots a real server over a real database, and
    // several (commerce, assistant, the main serve suite) chain a dozen HTTP
    // round trips per test. 15s held on a developer machine; on a two-core CI
    // runner the tests that crossed it changed from one job to the next,
    // which is load, not a hang. A real hang still fails at 60s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
