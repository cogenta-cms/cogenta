import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'forms',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
