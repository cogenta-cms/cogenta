import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'fleet',
    include: ['test/**/*.test.ts'],
  },
})
