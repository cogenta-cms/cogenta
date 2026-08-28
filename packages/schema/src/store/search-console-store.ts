import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import {
  SEARCH_CONSOLE_CONNECTION_ID,
  SEARCH_CONSOLE_CONNECTION_TABLE,
} from './search-console-tables.js'

/**
 * The one Google Search Console connection a site can have (fiche 70 task
 * 4, ADR-0032). Same encryption discipline as `@cogenta/agents`'
 * `ProviderConfigStore` and `@cogenta/mcp`'s connection store — AES-256-GCM
 * via `node:crypto`, key derived from `COGENTA_AUTH_SIGNING_KEY` with a
 * purpose-specific salt so the derived key is never the literal signing key
 * reused across purposes (R7: no second secret to generate, rotate or
 * lose). The refresh token is the only thing encrypted; `siteUrl` is not a
 * secret (it is the property URL, already public knowledge to anyone who
 * knows the site's own domain).
 *
 * Real database table (`ensureSearchConsoleConnectionTable`), not a file
 * store: a Search Console connection is exactly the kind of "fixed row, not
 * schema-declared content" `menu-tables.ts`/`pattern-tables.ts` already
 * established a home for in this package, and it gets the same
 * SQLite/Postgres/MySQL portability their tables already have for free.
 */

export interface SearchConsoleConnectionSummary {
  readonly siteUrl: string
  readonly connectedAt: string
  readonly updatedAt: string
}

export interface ConnectSearchConsoleInput {
  readonly siteUrl: string
  readonly refreshToken: string
}

export interface SearchConsoleConnectionStore {
  /** `null` when no site has ever completed the OAuth flow. */
  read(): Promise<SearchConsoleConnectionSummary | null>
  /** Encrypts and persists `refreshToken`; replaces any existing connection (a site connects to at most one GSC property at a time). */
  connect(input: ConnectSearchConsoleInput): Promise<SearchConsoleConnectionSummary>
  disconnect(): Promise<void>
  /** The one place the real refresh token is ever decrypted. Throws `SEARCH_CONSOLE_NOT_CONNECTED` if there is none. */
  decryptRefreshToken(): Promise<string>
}

interface ConnectionRow {
  readonly id: string
  readonly site_url: string
  readonly refresh_token_iv: string
  readonly refresh_token_auth_tag: string
  readonly refresh_token_ciphertext: string
  readonly connected_at: string
  readonly updated_at: string
}

const KEY_DERIVATION_SALT = 'cogenta-search-console-secrets-v1'
const ALGORITHM = 'aes-256-gcm'

function deriveKey(signingKey: string): Buffer {
  return scryptSync(signingKey, KEY_DERIVATION_SALT, 32)
}

function notConnected(): CogentaError {
  return new CogentaError({
    code: 'SEARCH_CONSOLE_NOT_CONNECTED',
    message: 'No site has connected a Google Search Console property yet.',
    hint: "Connect one from the SEO screen's Diagnostics tab first.",
  })
}

function toSummary(row: ConnectionRow): SearchConsoleConnectionSummary {
  return { siteUrl: row.site_url, connectedAt: row.connected_at, updatedAt: row.updated_at }
}

export interface SearchConsoleConnectionStoreOptions {
  readonly db: DatabaseHandle
  /** `COGENTA_AUTH_SIGNING_KEY` — the encryption key is derived from it, never stored itself. */
  readonly signingKey: string
  readonly now?: () => Date
}

export function createSearchConsoleConnectionStore(
  options: SearchConsoleConnectionStoreOptions,
): SearchConsoleConnectionStore {
  const { db } = options
  const now = options.now ?? ((): Date => new Date())
  const key = deriveKey(options.signingKey)
  const table = identifier(SEARCH_CONSOLE_CONNECTION_TABLE, db.dialect)

  function encrypt(plaintext: string): { iv: string; authTag: string; ciphertext: string } {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return {
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }
  }

  function decrypt(row: ConnectionRow): string {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(row.refresh_token_iv, 'base64'))
    decipher.setAuthTag(Buffer.from(row.refresh_token_auth_tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.refresh_token_ciphertext, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  }

  async function findRow(): Promise<ConnectionRow | null> {
    const found = await db.query<ConnectionRow>(
      sql`select * from ${table} where id = ${SEARCH_CONSOLE_CONNECTION_ID}`,
    )
    return found.rows[0] ?? null
  }

  return {
    async read() {
      const row = await findRow()
      return row === null ? null : toSummary(row)
    },

    async connect(input) {
      const { iv, authTag, ciphertext } = encrypt(input.refreshToken)
      const existing = await findRow()
      const nowIso = now().toISOString()
      const connectedAt = existing?.connected_at ?? nowIso

      if (existing === null) {
        await db.query(sql`
          insert into ${table} (
            id, site_url, refresh_token_iv, refresh_token_auth_tag,
            refresh_token_ciphertext, connected_at, updated_at
          ) values (
            ${SEARCH_CONSOLE_CONNECTION_ID}, ${input.siteUrl}, ${iv}, ${authTag},
            ${ciphertext}, ${connectedAt}, ${nowIso}
          )`)
      } else {
        await db.query(sql`
          update ${table} set
            site_url = ${input.siteUrl},
            refresh_token_iv = ${iv},
            refresh_token_auth_tag = ${authTag},
            refresh_token_ciphertext = ${ciphertext},
            updated_at = ${nowIso}
          where id = ${SEARCH_CONSOLE_CONNECTION_ID}`)
      }

      return { siteUrl: input.siteUrl, connectedAt, updatedAt: nowIso }
    },

    async disconnect() {
      await db.query(sql`delete from ${table} where id = ${SEARCH_CONSOLE_CONNECTION_ID}`)
    },

    async decryptRefreshToken() {
      const row = await findRow()
      if (row === null) throw notConnected()
      return decrypt(row)
    },
  }
}
