import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReferenceDocumentStore } from '../../../src/rag/reference-documents/store.js'

/**
 * The single contract suite for `ReferenceDocumentStore` (L22 task 4) — run
 * against SQLite in-process (`store.test.ts`) and, when the service is
 * reachable, against Postgres/MySQL/MariaDB
 * (`test/integration/reference-document-store.test.ts`). The project's
 * standing rule applies here too: one suite, every dialect, never a copy
 * adapted to what one happens to do.
 */
export interface ReferenceDocumentContractHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

export function runReferenceDocumentStoreContract(
  name: string,
  create: () => Promise<ReferenceDocumentContractHarness> | ReferenceDocumentContractHarness,
): void {
  describe(`ReferenceDocumentStore — ${name}`, () => {
    let harness: ReferenceDocumentContractHarness

    beforeEach(async () => {
      harness = await create()
    })

    afterEach(async () => {
      await harness.dispose?.()
    })

    it('is empty on a fresh site', async () => {
      const store = createReferenceDocumentStore(harness.db)
      await store.ensureTable()
      expect(await store.list('https://example.com')).toEqual([])
    })

    it('records an upload as pending, with no chunk count and no index time yet', async () => {
      const store = createReferenceDocumentStore(harness.db, () => 1_000)
      await store.ensureTable()

      const created = await store.create({
        siteId: 'https://example.com',
        filename: 'handbook.pdf',
        format: 'pdf',
        characters: 4200,
        warnings: ['page 3 has no text layer'],
        uploadedBy: 'user-1',
      })

      expect(created.status).toBe('pending')
      expect(created.chunkCount).toBe(0)
      expect(created.indexedAt).toBeNull()
      expect(created.errorMessage).toBeNull()
      expect(created.warnings).toEqual(['page 3 has no text layer'])

      const fetched = await store.get('https://example.com', created.id)
      expect(fetched).toEqual(created)
    })

    it('moves a pending document to indexed, with a chunk count and a timestamp', async () => {
      const store = createReferenceDocumentStore(harness.db)
      await store.ensureTable()
      const created = await store.create({
        siteId: 'https://example.com',
        filename: 'handbook.pdf',
        format: 'pdf',
        characters: 4200,
        warnings: [],
        uploadedBy: null,
      })

      await store.markIndexed('https://example.com', created.id, 7, '2026-08-20T00:00:00.000Z')

      const fetched = await store.get('https://example.com', created.id)
      expect(fetched).toMatchObject({
        status: 'indexed',
        chunkCount: 7,
        indexedAt: '2026-08-20T00:00:00.000Z',
        errorMessage: null,
      })
    })

    it('moves a pending document to error, with the failure message kept', async () => {
      const store = createReferenceDocumentStore(harness.db)
      await store.ensureTable()
      const created = await store.create({
        siteId: 'https://example.com',
        filename: 'corrupt.pdf',
        format: 'pdf',
        characters: 0,
        warnings: [],
        uploadedBy: null,
      })

      await store.markError('https://example.com', created.id, 'the embedding provider timed out')

      const fetched = await store.get('https://example.com', created.id)
      expect(fetched).toMatchObject({
        status: 'error',
        errorMessage: 'the embedding provider timed out',
        indexedAt: null,
      })
    })

    it('never shows one site a document uploaded on another', async () => {
      const store = createReferenceDocumentStore(harness.db)
      await store.ensureTable()
      await store.create({
        siteId: 'https://a.example.com',
        filename: 'a.pdf',
        format: 'pdf',
        characters: 10,
        warnings: [],
        uploadedBy: null,
      })

      expect(await store.list('https://b.example.com')).toEqual([])
      expect(await store.get('https://a.example.com', 'nonexistent')).toBeNull()
    })

    it('lists newest upload first', async () => {
      const store = createReferenceDocumentStore(harness.db)
      await store.ensureTable()
      const first = await store.create({
        siteId: 'https://example.com',
        filename: 'first.pdf',
        format: 'pdf',
        characters: 10,
        warnings: [],
        uploadedBy: null,
      })
      const second = await store.create({
        siteId: 'https://example.com',
        filename: 'second.pdf',
        format: 'pdf',
        characters: 10,
        warnings: [],
        uploadedBy: null,
      })

      const listed = await store.list('https://example.com')
      expect(listed.map((doc) => doc.id)).toEqual([second.id, first.id])
    })

    it('removes a document, and a second removal fails honestly rather than silently no-oping', async () => {
      const store = createReferenceDocumentStore(harness.db)
      await store.ensureTable()
      const created = await store.create({
        siteId: 'https://example.com',
        filename: 'gone.pdf',
        format: 'pdf',
        characters: 10,
        warnings: [],
        uploadedBy: null,
      })

      await store.remove('https://example.com', created.id)
      expect(await store.get('https://example.com', created.id)).toBeNull()

      await expect(store.remove('https://example.com', created.id)).rejects.toMatchObject({
        code: 'ASSIST_DOCUMENT_NOT_FOUND',
      })
    })
  })
}
