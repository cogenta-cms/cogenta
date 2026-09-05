import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-association',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
