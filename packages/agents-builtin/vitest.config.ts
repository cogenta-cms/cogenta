import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'agents-builtin',
    include: ['test/**/*.test.ts'],
  },
})
