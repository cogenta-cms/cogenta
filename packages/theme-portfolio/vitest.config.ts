import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-portfolio',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
