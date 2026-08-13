import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'auth',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
