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
  },
})
