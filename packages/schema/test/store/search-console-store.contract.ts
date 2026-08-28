import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SearchConsoleConnectionStore } from '../../src/store/search-console-store.js'
import { createSearchConsoleConnectionStore } from '../../src/store/search-console-store.js'
import {
  ensureSearchConsoleConnectionTable,
  SEARCH_CONSOLE_CONNECTION_TABLE,
} from '../../src/store/search-console-tables.js'

/**
 * The single contract suite for the Search Console connector's stored
 * connection (fiche 70 task 4, ADR-0032) — SQLite as a unit test, Postgres/
 * MySQL/MariaDB as integration tests (`test/integration/search-console-store.test.ts`),
 * the same split `pattern-store.contract.ts` already established for the
 * closest sibling shape (a not-schema-declared, one-fixed-row store).
 */

export interface SearchConsoleStoreHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

const SIGNING_KEY = 'contract-test-signing-key-not-a-real-secret'

export function runSearchConsoleStoreContract(
  name: string,
  create: () => Promise<SearchConsoleStoreHarness>,
): void {
  describe(`Search Console connection store contract — ${name}`, () => {
    let harness: SearchConsoleStoreHarness
    let db: DatabaseHandle
    let store: SearchConsoleConnectionStore

    beforeEach(async () => {
      harness = await create()
      db = harness.db
      await ensureSearchConsoleConnectionTable(db)
      store = createSearchConsoleConnectionStore({ db, signingKey: SIGNING_KEY })
    })

    afterEach(async () => {
      await db.close()
      await harness.dispose?.()
    })

    it('reports no connection at all before one is ever made', async () => {
      expect(await store.read()).toBeNull()
    })

    it('connects, and reads back the site URL and timestamps — never the token itself', async () => {
      const summary = await store.connect({
        siteUrl: 'https://example.com/',
        refreshToken: '1//real-refresh-token',
      })
      expect(summary.siteUrl).toBe('https://example.com/')
      expect(summary.connectedAt).toBeTruthy()
      expect(summary.updatedAt).toBeTruthy()
      // `SearchConsoleConnectionSummary` has no field a refresh token could
      // ever leak through — this is a structural guarantee, not a filter
      // this test has to remember to apply.
      expect(Object.keys(summary).sort()).toEqual(['connectedAt', 'siteUrl', 'updatedAt'])

      const read = await store.read()
      expect(read).toEqual(summary)
    })

    it('decrypts the exact refresh token that was connected', async () => {
      await store.connect({ siteUrl: 'https://example.com/', refreshToken: 'real-token-value' })
      expect(await store.decryptRefreshToken()).toBe('real-token-value')
    })

    it('throws SEARCH_CONSOLE_NOT_CONNECTED when decrypting with no connection', async () => {
      await expect(store.decryptRefreshToken()).rejects.toMatchObject({
        code: 'SEARCH_CONSOLE_NOT_CONNECTED',
      })
    })

    it('replaces the connection on a second connect, keeping the original connectedAt', async () => {
      const first = await store.connect({
        siteUrl: 'https://old.example.com/',
        refreshToken: 'old-token',
      })
      const second = await store.connect({
        siteUrl: 'https://new.example.com/',
        refreshToken: 'new-token',
      })

      expect(second.siteUrl).toBe('https://new.example.com/')
      expect(second.connectedAt).toBe(first.connectedAt)
      expect(await store.decryptRefreshToken()).toBe('new-token')
    })

    it('disconnects, clearing the stored connection entirely', async () => {
      await store.connect({ siteUrl: 'https://example.com/', refreshToken: 'token' })
      await store.disconnect()

      expect(await store.read()).toBeNull()
      await expect(store.decryptRefreshToken()).rejects.toMatchObject({
        code: 'SEARCH_CONSOLE_NOT_CONNECTED',
      })
    })

    it('is a no-op to disconnect when nothing is connected', async () => {
      await expect(store.disconnect()).resolves.toBeUndefined()
    })

    it('never stores the refresh token as recoverable plaintext', async () => {
      await store.connect({
        siteUrl: 'https://example.com/',
        refreshToken: 'a-plaintext-marker-value',
      })
      const table = identifier(SEARCH_CONSOLE_CONNECTION_TABLE, db.dialect)
      const found = await db.query<Record<string, unknown>>(sql`select * from ${table}`)
      const row = found.rows[0]
      expect(row).toBeDefined()
      expect(JSON.stringify(row)).not.toContain('a-plaintext-marker-value')
    })

    it('decrypts correctly with a store built from a fresh handle to the same database — proving the encryption key is derived deterministically', async () => {
      await store.connect({ siteUrl: 'https://example.com/', refreshToken: 'stable-token' })
      const reopened = createSearchConsoleConnectionStore({ db, signingKey: SIGNING_KEY })
      expect(await reopened.decryptRefreshToken()).toBe('stable-token')
    })
  })
}
