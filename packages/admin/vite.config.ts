import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    // `cogenta serve` (packages/cli) listens on 4000 by default. The admin
    // dev server proxies to it so a relative fetch('/api/...') works the
    // same way in dev as it does once `cogenta serve` serves this build.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
    },
  },
})
