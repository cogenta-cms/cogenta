import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@cogenta/starters',
    include: ['test/**/*.test.ts'],
    // Most of these tests only read the packs, but the demo-art renderer
    // encodes real PNGs and a few read every bundled photograph: fine alone,
    // too slow for the 5s default under a full workspace run. Same setting
    // as create-cogenta, where these tests lived until L28.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
