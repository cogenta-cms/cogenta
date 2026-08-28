import { describe, expect, it } from 'vitest'
import { createSqliteHandle, identifier, sql } from '../../src/db/index.js'
import { createDatabaseMediaFolderStore, createDatabaseMediaStore } from '../../src/media/index.js'
import { runMediaFolderContract } from './folder-store.contract.js'

runMediaFolderContract('sqlite', async () => {
  const db = await createSqliteHandle({ url: ':memory:' })
  return {
    createFolderStore: () => Promise.resolve(createDatabaseMediaFolderStore({ db })),
    createMediaStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
    dispose: () => db.close(),
  }
})

/**
 * The piège fiche 46 calls out by name: a media table that already existed
 * before this fiche (no `folder_id` column) must upgrade in place, and every
 * asset it already held must stay unclassified — never get silently swept
 * into whatever folder happens to be created afterwards. Same discipline as
 * `write-migration`'s own up/down/up requirement, adapted to this table's
 * established shape (a `create table if not exists` + `alter table … add
 * column` guarded by `try`/`catch`, the same pattern `tags`/`content_hash`
 * already used before this fiche — there is no separate migration file for
 * `cogenta_media`, so "up" here means "run the store against a pre-existing
 * table built by hand at the 2026-08 (fiche 11) shape").
 */
describe('media folders: upgrading a pre-fiche-46 media table', () => {
  it('keeps every pre-existing asset unclassified rather than assigning it a folder', async () => {
    const db = await createSqliteHandle({ url: ':memory:' })
    try {
      const table = identifier('cogenta_media', db.dialect)
      // The exact shape `createDatabaseMediaStore` produced before this
      // fiche (fiche 11: tags + content_hash, no folder_id).
      await db.query(sql`
        create table ${table} (
          id varchar(64) not null primary key,
          kind varchar(16) not null,
          filename varchar(512) not null,
          mime_type varchar(255) not null,
          size bigint not null,
          width integer,
          height integer,
          alt text not null,
          decorative boolean not null,
          decorative_justification text,
          focal text,
          storage_key varchar(1024) not null,
          tags text,
          content_hash varchar(64),
          created_at varchar(32) not null,
          created_by varchar(255)
        )`)
      await db.query(sql`
        insert into ${table}
          (id, kind, filename, mime_type, size, alt, decorative, storage_key, created_at)
        values
          ('pre-existing', 'image', 'old.jpg', 'image/jpeg', 10, 'An old photo', false,
           'media/old.jpg', '2026-01-01T00:00:00.000Z')`)

      const media = createDatabaseMediaStore({ db })
      const preExisting = await media.get('pre-existing')
      expect(preExisting?.folderId).toBeNull()

      const folders = createDatabaseMediaFolderStore({ db })
      await folders.ensureRoot('contents')

      // Still unclassified after the folder bootstrap runs — nothing ever
      // backfills `folder_id` for a row that predates it.
      const afterBootstrap = await media.get('pre-existing')
      expect(afterBootstrap?.folderId).toBeNull()

      const list = await media.list({ folderId: null })
      expect(list.items.map((item) => item.id)).toContain('pre-existing')
    } finally {
      await db.close()
    }
  })
})
