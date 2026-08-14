import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'example-getting-started',
    include: ['test/**/*.test.ts'],
  },
})
