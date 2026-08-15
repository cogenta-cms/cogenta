import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // `cogenta serve` (packages/cli) serves the production build under
  // `/admin/*`, alongside the public theme render at `/` — this build needs
  // its own asset URLs and `BrowserRouter`'s `basename` (`app.tsx`, driven by
  // `import.meta.env.BASE_URL`) to agree on that prefix. The dev server keeps
  // serving at `/` — the local workflow (`pnpm dev`, no `cogenta serve` in
  // front of it) has no `/admin` prefix to match.
  base: command === 'build' ? '/admin/' : '/',
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
}))
