import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'admin',
    environment: 'jsdom',
    include: ['test/**/*.test.tsx', 'test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // jsdom's own environment setup competes for CPU with every other
    // package's test run under `pnpm test` at the workspace root, and can
    // take longer than the default 5s on its own before a single test body
    // even starts — this is that headroom, not slack for a slow test.
    testTimeout: 20_000,
    server: {
      deps: {
        // Keep the Node-only workspace packages out of the client bundler.
        //
        // The admin imports `@cogenta/render` (markdown and skin helpers) and
        // `@cogenta/blocks` (the block vocabulary). Both depend on
        // `@cogenta/core`, whose single entry re-exports `db/index.js` and so
        // reaches `node:sqlite`. `vite build` survives that because it
        // tree-shakes the unused branch away; Vitest's module runner does
        // not — it transforms each module on its own, hits a Node built-in it
        // cannot bundle for a client environment, and fails the *file*, which
        // is why all seventy admin suites died at load with no assertion in
        // sight.
        //
        // Whether Vite inlines a pnpm-linked workspace package or leaves it
        // external turns out to differ by platform: every one of these suites
        // passes on Windows and fails on Linux and macOS runners. Saying it
        // explicitly is what makes the behaviour the same everywhere, instead
        // of depending on how a symlink resolves.
        //
        // Externalised, not stubbed: Node loads these normally, so a test that
        // really uses one gets the real thing.
        external: [/@cogenta\/(core|render|blocks|schema)/],
      },
    },
  },
})
