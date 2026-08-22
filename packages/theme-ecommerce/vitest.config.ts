import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'theme-ecommerce',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
