import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-docs',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
