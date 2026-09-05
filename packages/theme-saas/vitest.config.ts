import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-saas',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
