import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'export',
    include: ['test/**/*.test.ts'],
    // scrypt's deliberately heavy cost parameters (crypto.ts) plus real
    // filesystem I/O for backup/restore tests need more than the 5s default.
    testTimeout: 30_000,
  },
})
