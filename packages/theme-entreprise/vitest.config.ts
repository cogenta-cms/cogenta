import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-entreprise',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
