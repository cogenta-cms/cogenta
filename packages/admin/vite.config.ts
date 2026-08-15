import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // Tailwind v4 needs no config file: the palette, radius scale and font stack
  // are declared in `src/styles/theme.css` (L11 task 1), and this plugin is
  // only what compiles the utilities the components in `src/ui/` actually use.
  // `vitest.config.ts` deliberately does not load it — Vitest leaves CSS
  // imports unprocessed, so a unit test never pays for a Tailwind build.
  plugins: [tailwindcss(), react()],
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
