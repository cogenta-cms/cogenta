import { stat } from 'node:fs/promises'
import process from 'node:process'

/**
 * Detects, but never blocks, the two secret-hygiene gaps fiche 23 names as
 * open (audit follow-up to L10 task 6 / `docs/hebergement-mutualise.md`):
 * `create-cogenta` used to write a database URL — password included — into
 * `cogenta.config.mjs` in the clear, and the generated `.env` (which holds
 * `COGENTA_AUTH_SIGNING_KEY`) was written without a restrictive file mode, so
 * another tenant on shared hosting could read it.
 *
 * `SECRET_KEYS` (`env.ts`) cannot simply gain `database.url`: unlike an API
 * key, a database URL is legitimately present in the file for the common
 * case — a SQLite path, or a Postgres URL with no password at all (peer
 * trust, a local dev server) — so refusing it outright at `resolveConfig`
 * would break every SQLite site, which is Cogenta's zero-config default.
 * What *is* always wrong is a URL that embeds real credentials: that half is
 * detected here and **surfaced**, on the ops-settings mirror (fiche 23 task
 * 5's literal ask — "détecter et signaler"), never turned into a hard
 * refusal that would regress a legitimate config.
 */

/**
 * `true` when `value` parses as a URL carrying a non-empty username or
 * password. A bare path (`./data.db`, `:memory:`) or a URL with no userinfo
 * (`postgres://localhost/db`) is `false` — there is nothing secret to leak.
 */
export function urlHasEmbeddedCredentials(value: string): boolean {
  try {
    const url = new URL(value)
    return url.username !== '' || url.password !== ''
  } catch {
    return false
  }
}

export interface SecretHygieneReport {
  /** `true` when the raw config file sets `database.url` to a URL carrying real credentials. */
  readonly databaseUrlHasCredentialsInFile: boolean
  /** The `.env` file `loadConfig` looked for next to the config, or `null` when there is no config file. */
  readonly envFilePath: string | null
  /**
   * `true` when `.env` grants read access to the file's group or to anyone
   * else on the machine — exactly what a shared-hosting neighbour would use.
   * `null` when there is no `.env` file, or the platform's permission bits
   * are not the POSIX ones this check reads (win32).
   */
  readonly envFileReadableByOthers: boolean | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Reads the raw, unresolved `database.url` a config file declares, or `undefined` for none. */
export function rawDatabaseUrl(input: unknown): string | undefined {
  if (!isPlainObject(input)) return undefined
  const database = input['database']
  if (!isPlainObject(database)) return undefined
  const url = database['url']
  return typeof url === 'string' ? url : undefined
}

/**
 * `true` when `mode` (a POSIX file mode, as `fs.Stats.mode` reports it)
 * grants read access to its group or to "other" — the two bits that matter
 * on a shared host, where every tenant's process runs as a different,
 * unprivileged user. Pure and platform-independent so the actual security
 * arithmetic — which bits mean "someone else can read this" — is tested
 * directly, without a real file or a real POSIX host.
 */
export function hasGroupOrOtherRead(mode: number): boolean {
  // group-read (0o040) or other-read (0o004).
  return (mode & 0o044) !== 0
}

/**
 * `path`'s mode, read from disk, or `null` on a platform whose permission
 * model this check does not understand (win32 — ACLs, not POSIX rwx bits;
 * Node synthesises a `mode` there rather than reporting a real one, and
 * reporting `false` would claim a guarantee that platform cannot make) or
 * when the file cannot be stat'd at all. Read-only by design: fixing the
 * mode is `create-cogenta`'s job at write time (`scaffold.ts`), not
 * something a running server silently changes under an operator's file.
 */
async function isReadableByOthers(path: string): Promise<boolean | null> {
  if (process.platform === 'win32') return null
  try {
    const info = await stat(path)
    return hasGroupOrOtherRead(info.mode)
  } catch {
    return null
  }
}

/**
 * Builds the report `loadConfig` attaches to `LoadedConfig`. `rawConfig` is
 * the *unresolved* file contents (before `resolveConfig` strips anything) —
 * the same object `findSecretsInFile` already inspects.
 */
export async function buildSecretHygieneReport(
  rawConfig: unknown,
  envFilePath: string | null,
  envFileExists: boolean,
): Promise<SecretHygieneReport> {
  const url = rawDatabaseUrl(rawConfig)
  const path = envFileExists ? envFilePath : null
  return {
    databaseUrlHasCredentialsInFile: url !== undefined && urlHasEmbeddedCredentials(url),
    envFilePath: path,
    envFileReadableByOthers: path === null ? null : await isReadableByOthers(path),
  }
}
