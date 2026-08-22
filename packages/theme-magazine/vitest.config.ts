import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-magazine',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
