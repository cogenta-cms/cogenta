import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'create-cogenta',
    include: ['test/**/*.test.ts'],
  },
})
