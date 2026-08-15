import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'example-plugin-starter',
    include: ['test/**/*.test.ts'],
  },
})
