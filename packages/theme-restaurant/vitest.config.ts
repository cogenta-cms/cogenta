import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-restaurant',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
