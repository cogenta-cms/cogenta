import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-blog',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
