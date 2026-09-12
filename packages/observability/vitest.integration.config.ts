import { defineConfig } from 'vitest/config'

// This package has no integration suite yet — the script that runs this file
// exists workspace-wide, and pointing it at a config that was never written
// made `pnpm test:integration` fail with "Cannot resolve entry module"
// rather than pass with nothing to do. `--passWithNoTests` in the script is
// what makes an empty `test/integration` honest instead of an error.
export default defineConfig({
  test: {
    name: 'observability:integration',
    include: ['test/integration/**/*.test.ts'],
  },
})
