import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'channels',
    include: ['test/**/*.test.ts'],
  },
})
