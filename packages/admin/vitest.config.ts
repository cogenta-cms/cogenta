import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        // `node:sqlite` has no business in a browser application, and the
        // shipped bundle contains none of it — `vite build` tree-shakes it
        // away. It reaches the *test* graph only because `@cogenta/core`'s
        // single public entry re-exports `db/index.js`, so importing
        // `@cogenta/render` or `@cogenta/blocks` pulls the whole driver stack
        // behind it. Vitest's module runner transforms each module on its own
        // with no tree-shaking, meets a Node built-in it cannot bundle for a
        // client environment, and fails the *file* — seventy admin suites
        // dying at load with no assertion in sight.
        //
        // Two configuration attempts came before this one and neither did
        // anything: `test.server.deps.external` (a Vitest option, the wrong
        // layer) and `environments.client.resolve.external` (the Vite 8 API
        // the error message itself names). Both are gone rather than left in
        // as decoration. An alias works because it removes the question —
        // there is no built-in left to bundle.
        //
        // The stub throws on every member, so a test that genuinely wants a
        // database fails loudly instead of passing against a pretend one.
        find: /^node:sqlite$/,
        replacement: fileURLToPath(new URL('./test/stubs/node-sqlite.ts', import.meta.url)),
      },
    ],
  },
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
  },
})
