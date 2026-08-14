import { defineConfig } from '@cogenta/core'

export default defineConfig({
  site: {
    name: 'My site',
    url: 'https://example.com',
    locales: ['en'],
    defaultLocale: 'en',
  },
  database: {
    driver: 'sqlite',
    url: './.cogenta/site.db',
  },
})
