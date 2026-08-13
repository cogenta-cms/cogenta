import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-canonical',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
