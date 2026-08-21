import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import posixPath from 'node:path/posix'
import { fileURLToPath } from 'node:url'

/**
 * `@cogenta/admin`'s own `vite build` output, copied into this package's
 * `dist/admin-assets` at build time (`package.json`'s `build` script) —
 * never a real npm dependency, since `@cogenta/admin` is `private` and has
 * no publishable version. Resolved relative to this compiled module's own
 * location so it works the same whether `@cogenta/cli` is run from the
 * workspace or from a real npm install.
 */
const ADMIN_ASSETS_DIR = fileURLToPath(new URL('../admin-assets', import.meta.url))

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

export interface AdminAsset {
  readonly body: Buffer
  readonly contentType: string
  readonly cacheControl: string
}

/**
 * `vite build`'s own convention: every file under `assets/` is named with a
 * content hash (`index-D3nbgRin.js`) — a rebuild that changes the file
 * changes the name, so it is safe to cache forever. `index.html` (and any
 * extension-less SPA route that resolves to it) references those hashed
 * names and has no hash of its own, so it must always be revalidated —
 * serving it stale is exactly what would make a real fix invisible in an
 * already-open browser tab after a rebuild+restart, no matter how correct
 * the fix itself is.
 */
function cacheControlFor(targetPath: string): string {
  // `join` uses the OS-native separator (`\` on Windows); normalise before
  // matching so this doesn't silently miss on the one platform this project
  // develops on day to day.
  return targetPath.replaceAll('\\', '/').includes('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache'
}

/**
 * Serves one file from the built admin SPA for a request under `/admin`. A
 * real built asset (`/admin/assets/index-*.js`) gets that exact file, still
 * a real 404 (via `null`) if it is missing — never silently swapped for
 * `index.html`, which would make a missing script fail as confusing broken
 * HTML in the browser instead of an honest 404. Any extension-less path
 * (`/admin`, `/admin/collections/post`, …) gets `index.html`, so the SPA's
 * own client-side router (`react-router`, `basename="/admin"`) resolves the
 * deep link — the standard "serve the shell, let the client router take
 * over" contract every SPA host needs. `null` also covers the case where the
 * admin build simply is not present (running from source without a build).
 *
 * Path segments come from the URL, always `/`-separated regardless of OS —
 * normalised with `path/posix`, then joined onto the real, OS-native
 * `ADMIN_ASSETS_DIR` with `path.join`, which never lets a resolved segment
 * escape it (an absolute-looking second argument is still appended, not
 * substituted).
 */
export async function serveAdminAsset(
  pathname: string,
  assetsDir: string = ADMIN_ASSETS_DIR,
): Promise<AdminAsset | null> {
  const relative = pathname.slice('/admin'.length) || '/'
  const normalized = posixPath.normalize(relative)
  const hasExtension = posixPath.extname(normalized) !== ''
  const targetPath = join(assetsDir, hasExtension ? normalized : 'index.html')

  try {
    const body = await readFile(targetPath)
    const contentType = CONTENT_TYPES[extname(targetPath)] ?? 'application/octet-stream'
    return { body, contentType, cacheControl: cacheControlFor(targetPath) }
  } catch {
    return null
  }
}
