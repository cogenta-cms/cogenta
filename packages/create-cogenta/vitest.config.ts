import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'create-cogenta',
    include: ['test/**/*.test.ts'],
    // These tests scaffold real sites: write the files, create the database,
    // run the migrations, seed content, sometimes boot a server. That is real
    // work, not a slow test, and on its own it passes every time (246/246).
    // Under a full workspace run beside twenty-nine other packages the 5s
    // default is gone before the first file is written. Set once here, as
    // admin, cli, export, auth and api already do. A whole default install
    // (the showcase site: thirty images, five variants each) took 55-60s on a
    // two-core CI runner and failed there at 60s, so it gets twice that.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
