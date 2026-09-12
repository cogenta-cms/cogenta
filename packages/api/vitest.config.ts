import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'api',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    // The recovery-code tests hash ten codes and then compare a wrong one
    // against all ten. That cost is the feature, not slowness to be fixed,
    // and it sits close enough to the 5s default that a loaded runner tips it
    // over — which is exactly what happened, on CI only.
    //
    // One test in that block already carried its own `15_000`, added by
    // whoever hit this first. Several of its neighbours do the same work and
    // carry nothing, so patching them one at a time only means waiting for
    // each to flake in turn. Set once, here, as admin (20s), cli (15s),
    // export (30s) and auth (20s) already do.
    testTimeout: 20_000,
  },
})
