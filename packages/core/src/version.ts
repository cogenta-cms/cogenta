import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CogentaError } from './errors/cogenta-error.js'

/**
 * Reads the `version` field of the `package.json` that sits at `packageRoot`
 * — self-describing, not looked up through `node_modules` resolution or
 * copied into a generated constant at build time.
 *
 * `packageRoot` is meant to be computed once, at each caller's own top level,
 * as `new URL('../', import.meta.url)` from a module that sits exactly one
 * directory below its package's root — which is true of `src/version.ts`
 * here, of `src/index.ts` in `@cogenta/cli`, and of any future caller that
 * keeps the same `rootDir: "./src"` / `outDir: "./dist"` layout every
 * `tsconfig.json` in this monorepo already uses (`src/foo.ts` compiles to
 * `dist/foo.js`, one level below the package root either way — in dev, under
 * `vitest`, `import.meta.url` still points at the `.ts` file in `src/`, so
 * the same relative path resolves there too).
 *
 * Deliberately synchronous and local: an installed package always carries
 * its own `package.json` (npm never excludes it, regardless of `"files"`),
 * so reading a package's own version never needs the network the way
 * checking npm for a *newer* one does (`@cogenta/cli`'s `update` module).
 */
export function readOwnPackageVersion(packageRoot: URL): string {
  const path = fileURLToPath(new URL('package.json', packageRoot))
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    throw new CogentaError({
      code: 'PACKAGE_VERSION_UNREADABLE',
      message: `Could not read ${path} to determine this package's own version.`,
      hint: 'This indicates a broken install — an installed package always ships its own package.json.',
      cause: error,
      details: { path },
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new CogentaError({
      code: 'PACKAGE_VERSION_UNREADABLE',
      message: `${path} is not valid JSON.`,
      hint: 'This indicates a corrupted install.',
      cause: error,
      details: { path },
    })
  }

  const version = (parsed as { version?: unknown }).version
  if (typeof version !== 'string' || version === '') {
    throw new CogentaError({
      code: 'PACKAGE_VERSION_UNREADABLE',
      message: `${path} has no valid "version" field.`,
      hint: 'This indicates a corrupted package.json.',
      details: { path },
    })
  }
  return version
}

let cachedCoreVersion: string | undefined

/**
 * `@cogenta/core`'s own installed version — see `readOwnPackageVersion`.
 *
 * **Deliberately lazy, never a top-level constant.** `@cogenta/core` is the
 * one package nearly everything in this monorepo imports, including, via
 * `import type` re-exports, packages that end up loaded inside a bundler or
 * a browser-like test environment (`@cogenta/admin`'s Vitest+jsdom suite
 * really does execute this module's top level — confirmed by a real crash
 * while building this: `import.meta.url` there is not a `file://` URL,
 * `fileURLToPath` throws, and merely *importing* `@cogenta/core` broke
 * every admin test that happened to pull it in transitively). A function
 * that only touches the filesystem when actually called — and only ever
 * is, in this codebase, from Node-only call sites (`@cogenta/cli`) — costs
 * nothing at import time in any environment, cached after the first real
 * call.
 */
export function getCoreVersion(): string {
  cachedCoreVersion ??= readOwnPackageVersion(new URL('../', import.meta.url))
  return cachedCoreVersion
}
