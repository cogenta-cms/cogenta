import { readOwnPackageVersion } from '@cogenta/core'

let cachedCliVersion: string | undefined

/**
 * `@cogenta/cli`'s own installed version — self-describing, read from this
 * package's own `package.json`, never bundled into a constant at build
 * time. See `@cogenta/core`'s `readOwnPackageVersion` for why, and its own
 * `getCoreVersion` for the sibling function — lazy for the exact same
 * reason: never touch the filesystem merely because a module was imported.
 *
 * Kept in its own module (not `index.ts`) so `commands/update.ts` can import
 * it directly without a circular import through `index.ts`, which re-exports
 * this same function for external callers.
 */
export function getCliVersion(): string {
  cachedCliVersion ??= readOwnPackageVersion(new URL('../', import.meta.url))
  return cachedCliVersion
}
