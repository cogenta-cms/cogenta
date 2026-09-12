import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'import',
    include: ['test/**/*.test.ts'],
    // A WordPress import test parses a real WXR fixture and writes every post,
    // page and comment through the real stores into a real SQLite file. That
    // is minutes of honest work compressed into one test, not slowness, and
    // it overruns the 5s default on a loaded runner.
    //
    // The `EBUSY: unlink site.db` failures on Windows came from the same
    // place: the timeout killed the test mid-write, so `dispose()` never ran
    // and the file was still open when the cleanup tried to delete it. The
    // lock was the symptom; the timeout was the cause.
    testTimeout: 30_000,
  },
})
