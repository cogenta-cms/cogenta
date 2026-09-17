import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createEmbedPreviewStore,
  type EmbedPreviewRecord,
  type EmbedPreviewStore,
  embedPreviewHash,
} from '../../src/store/embed-preview-store.js'
import {
  EMBED_PREVIEW_TABLE,
  ensureEmbedPreviewTable,
} from '../../src/store/embed-preview-tables.js'
import { resetTables } from '../helpers/reset-tables.js'

/**
 * The embed preview cache (L38), one contract for SQLite (unit) and
 * Postgres/MySQL/MariaDB (`test/integration/embed-preview-store.test.ts`).
 */

export interface EmbedPreviewStoreHarness {
  readonly db: DatabaseHandle
  dispose?(): Promise<void>
}

const RECORD: EmbedPreviewRecord = {
  url: 'https://www.youtube.com/watch?v=abc123',
  provider: 'youtube',
  status: 'ok',
  title: 'Inspection d’un poste électrique',
  authorName: 'Norvane',
  width: 560,
  height: 315,
  thumbnailKey: 'embeds/abc.jpg',
  thumbnailType: 'image/jpeg',
  thumbnailWidth: 480,
  thumbnailHeight: 360,
  fetchedAt: '2026-09-17T10:00:00.000Z',
}

export function runEmbedPreviewStoreContract(
  name: string,
  create: () => Promise<EmbedPreviewStoreHarness>,
): void {
  describe(`Embed preview store contract — ${name}`, () => {
    let harness: EmbedPreviewStoreHarness
    let store: EmbedPreviewStore

    beforeEach(async () => {
      harness = await create()
      await resetTables(harness.db, [EMBED_PREVIEW_TABLE])
      await ensureEmbedPreviewTable(harness.db)
      store = createEmbedPreviewStore(harness.db)
    })

    afterEach(async () => {
      try {
        await harness.db.close()
      } finally {
        await harness.dispose?.()
      }
    })

    it('reads back what it stored, by address and by hash', async () => {
      await store.put(RECORD)
      expect(await store.get(RECORD.url)).toEqual(RECORD)
      expect(await store.byHash(embedPreviewHash(RECORD.url))).toEqual(RECORD)
    })

    it('replaces the record of an address rather than keeping two', async () => {
      await store.put(RECORD)
      await store.put({ ...RECORD, title: 'Nouveau titre', fetchedAt: '2026-09-18T10:00:00.000Z' })
      expect((await store.get(RECORD.url))?.title).toBe('Nouveau titre')
    })

    it('remembers a failure, with nothing else known', async () => {
      const failed: EmbedPreviewRecord = {
        ...RECORD,
        url: 'https://vimeo.com/1',
        provider: 'vimeo',
        status: 'failed',
        title: null,
        authorName: null,
        width: null,
        height: null,
        thumbnailKey: null,
        thumbnailType: null,
        thumbnailWidth: null,
        thumbnailHeight: null,
      }
      await store.put(failed)
      expect(await store.get(failed.url)).toEqual(failed)
    })

    it('reads several addresses at once, leaving a miss out', async () => {
      await store.put(RECORD)
      const found = await store.getMany([RECORD.url, 'https://vimeo.com/404', RECORD.url])
      expect([...found.keys()]).toEqual([RECORD.url])
      expect((await store.getMany([])).size).toBe(0)
    })

    it('keeps an address of the full length contract B allows', async () => {
      const prefix = 'https://www.youtube.com/watch?v=abc&list='
      const long = `${prefix}${'x'.repeat(2048 - prefix.length)}`
      expect(long.length).toBe(2048)
      await store.put({ ...RECORD, url: long })
      expect((await store.get(long))?.url).toBe(long)
    })
  })
}
