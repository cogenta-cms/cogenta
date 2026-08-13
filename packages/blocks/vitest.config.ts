import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'blocks',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
