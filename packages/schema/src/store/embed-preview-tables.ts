import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { integerColumn, textColumn, timestampColumn } from './columns.js'

/**
 * The cache of resolved embed previews (L38): what an embed block's address
 * says about itself — title, author, proportions, a thumbnail the site serves
 * from its own storage. Same one-fixed-table treatment as `menu-tables.ts`:
 * this is not content an editor declares, it is derived data, recomputed from
 * the address whenever it is missing or stale.
 *
 * Keyed by a SHA-256 of the address rather than the address itself: an
 * address can be 2 048 characters (contract B), longer than a MySQL index
 * key may be.
 */
export const EMBED_PREVIEW_TABLE = 'cogenta_embed_previews'

export async function ensureEmbedPreviewTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  await db.query(sql`create table if not exists ${identifier(EMBED_PREVIEW_TABLE, dialect)} (
    ${identifier('url_hash', dialect)} ${textColumn(dialect, 64)} not null primary key,
    ${identifier('url', dialect)} ${textColumn(dialect, 2048)} not null,
    ${identifier('provider', dialect)} ${textColumn(dialect, 32)} not null,
    ${identifier('status', dialect)} ${textColumn(dialect, 16)} not null,
    ${identifier('title', dialect)} ${textColumn(dialect, 500)},
    ${identifier('author_name', dialect)} ${textColumn(dialect, 200)},
    ${identifier('width', dialect)} ${integerColumn()},
    ${identifier('height', dialect)} ${integerColumn()},
    ${identifier('thumbnail_key', dialect)} ${textColumn(dialect, 255)},
    ${identifier('thumbnail_type', dialect)} ${textColumn(dialect, 64)},
    ${identifier('thumbnail_width', dialect)} ${integerColumn()},
    ${identifier('thumbnail_height', dialect)} ${integerColumn()},
    ${identifier('fetched_at', dialect)} ${timestampColumn(dialect)} not null
  )`)
}
