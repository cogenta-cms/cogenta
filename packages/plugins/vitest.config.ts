import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'plugins',
    include: ['test/**/*.test.ts'],
  },
})
