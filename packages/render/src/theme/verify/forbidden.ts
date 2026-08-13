/**
 * What a theme may not import, from contract D, "Isolation, vérifiée à
 * l'installation".
 *
 * The lists below are the contract's, not a superset: refusing more than the
 * frozen contract announces would break themes that are legitimate under it.
 * What *is* added is the unprefixed spelling of each builtin — `import 'fs'`
 * and `import 'node:fs'` load the same module, and a check that only knows one
 * of the two spellings protects nothing.
 */

/** Builtins the contract names, in their `node:` spelling. */
export const FORBIDDEN_NODE_BUILTINS = [
  'node:fs',
  'node:child_process',
  'node:net',
  'node:http',
  'node:https',
  'node:dgram',
  'node:worker_threads',
  'node:vm',
  'node:process',
] as const

/** Cogenta packages that carry the database, the secrets, or both. */
export const FORBIDDEN_COGENTA_PACKAGES = ['@cogenta/core', '@cogenta/schema'] as const

/**
 * Database driver packages: "tout paquet de driver de base" made explicit.
 *
 * Named one by one rather than pattern-matched, because a refusal must be able
 * to say *which* driver it saw, and because a pattern loose enough to catch
 * them all also catches innocent package names.
 */
export const FORBIDDEN_DATABASE_PACKAGES = [
  'drizzle-orm',
  'pg',
  'pg-native',
  'postgres',
  'mysql',
  'mysql2',
  'mariadb',
  'sqlite3',
  'better-sqlite3',
  'node:sqlite',
  'sqlite',
  '@libsql/client',
  '@neondatabase/serverless',
  '@planetscale/database',
  '@vercel/postgres',
  'knex',
  'kysely',
  'typeorm',
  'sequelize',
  'prisma',
  '@prisma/client',
  'mongodb',
  'ioredis',
  'redis',
  '@redis/client',
] as const

export type ForbiddenKind = 'node-builtin' | 'cogenta-package' | 'database-driver'

interface ForbiddenModule {
  readonly specifier: string
  readonly kind: ForbiddenKind
}

/** Every spelling that resolves to a forbidden module, mapped to why it is forbidden. */
const FORBIDDEN = new Map<string, ForbiddenModule>()

for (const specifier of FORBIDDEN_NODE_BUILTINS) {
  const bare = specifier.slice('node:'.length)
  FORBIDDEN.set(specifier, { specifier, kind: 'node-builtin' })
  FORBIDDEN.set(bare, { specifier, kind: 'node-builtin' })
}
for (const specifier of FORBIDDEN_COGENTA_PACKAGES) {
  FORBIDDEN.set(specifier, { specifier, kind: 'cogenta-package' })
}
for (const specifier of FORBIDDEN_DATABASE_PACKAGES) {
  FORBIDDEN.set(specifier, { specifier, kind: 'database-driver' })
  if (!specifier.startsWith('node:'))
    FORBIDDEN.set(`node:${specifier}`, { specifier, kind: 'database-driver' })
}

/**
 * Resolves a module specifier to the forbidden module it reaches, or null.
 *
 * Subpaths count: `node:fs/promises` is `node:fs`, `@cogenta/core/db` is
 * `@cogenta/core`, and `drizzle-orm/postgres-js` is `drizzle-orm`. So does a
 * relative path that walks out of the theme into one of them — but that is not
 * a specifier question, it is caught by the scan covering every source file.
 */
export function matchForbidden(specifier: string): ForbiddenModule | null {
  const clean = specifier.trim()
  if (clean.length === 0) return null

  const exact = FORBIDDEN.get(clean)
  if (exact !== undefined) return exact

  // A scoped package owns two segments, everything else owns one.
  const segments = clean.split('/')
  const rootLength = clean.startsWith('@') ? 2 : 1
  if (segments.length <= rootLength) return null

  const root = segments.slice(0, rootLength).join('/')
  return FORBIDDEN.get(root) ?? null
}

export function describeKind(kind: ForbiddenKind): string {
  switch (kind) {
    case 'node-builtin':
      return 'a Node builtin the theme sandbox does not grant'
    case 'cogenta-package':
      return 'a Cogenta core package, which carries the database and the secrets'
    case 'database-driver':
      return 'a database driver'
  }
}
