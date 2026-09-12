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
        // Belt: keeps Vitest from inlining them through its own dep handling.
        external: [/@cogenta\/(core|render|blocks|schema)/],
      },
    },
  },
  // Braces: the error Vite actually raises names `environments.client
  // .noExternal`, which is the Vite 8 environments API and not the Vitest
  // option above — setting only the latter changed nothing.
  //
  // The admin imports `@cogenta/render` (markdown and skin helpers) and
  // `@cogenta/blocks` (the block vocabulary); both depend on `@cogenta/core`,
  // whose single entry re-exports `db/index.js` and so reaches `node:sqlite`.
  // `vite build` survives it by tree-shaking the unused branch. Vitest's
  // module runner transforms each module on its own, meets a Node built-in it
  // cannot bundle for a client environment, and fails the *file* — which is
  // why seventy admin suites died at load with no assertion in sight.
  //
  // This never reproduces on Windows, only on the Linux and macOS runners,
  // and not even forcing `server.deps.inline` brings it out here. Declaring
  // these external is what makes the behaviour the same everywhere instead of
  // depending on how a workspace symlink happens to resolve.
  environments: {
    client: {
      resolve: {
        external: ['@cogenta/core', '@cogenta/render', '@cogenta/blocks', '@cogenta/schema'],
      },
    },
  },
})
