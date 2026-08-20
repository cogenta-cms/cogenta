import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { fromNullableBool, toNullableBool } from './rows.js'
import { TABLES } from './tables.js'

/**
 * Per-collection and per-entry discussion overrides (fiche 15 task 5).
 *
 * The site-wide defaults (`discussion.enabled`, `discussion.moderationRequired`,
 * …) live in `@cogenta/schema`'s `SITE_SETTINGS_REGISTRY` — that store is
 * site/locale scoped only (`SiteSettingsStore.set(key, locale, value)`), with
 * no notion of "per collection" or "per entry". Rather than bending a
 * generic registry to a shape it was not built for, contract F keeps its own
 * two small override tables, exactly the way ADR-0025 keeps the rest of a
 * comment's storage independent of contract A.
 *
 * Both tables are tri-state through a nullable `boolean` column: `null`
 * means "inherit" (from the collection, and from the collection down to the
 * site default). `effectiveEnabled` below is the one function that resolves
 * the whole chain, so the entry-editor toggle, the settings screen and the
 * public POST route never each reimplement it differently.
 */

export interface CollectionCommentSettings {
  readonly collection: string
  readonly enabled: boolean | null
  readonly moderationRequired: boolean | null
}

export interface EntryCommentSettings {
  readonly collection: string
  readonly entryId: string
  readonly enabled: boolean | null
}

export interface CommentSettingsStore {
  getCollection(collection: string): Promise<CollectionCommentSettings>
  setCollection(
    collection: string,
    values: { readonly enabled?: boolean | null; readonly moderationRequired?: boolean | null },
  ): Promise<CollectionCommentSettings>
  getEntry(collection: string, entryId: string): Promise<EntryCommentSettings>
  setEntry(
    collection: string,
    entryId: string,
    enabled: boolean | null,
  ): Promise<EntryCommentSettings>
}

export function createCommentSettingsStore(
  db: DatabaseHandle,
  now: () => Date = () => new Date(),
): CommentSettingsStore {
  const d = db.dialect
  const collectionTable = identifier(TABLES.collectionSettings, d)
  const entryTable = identifier(TABLES.entrySettings, d)

  return {
    getCollection: async (collection) => {
      const result = await db.query<Record<string, unknown>>(
        sql`select * from ${collectionTable} where collection = ${collection}`,
      )
      const row = result.rows[0]
      if (row === undefined) return { collection, enabled: null, moderationRequired: null }
      return {
        collection,
        enabled: toNullableBool(row['enabled']),
        moderationRequired: toNullableBool(row['moderation_required']),
      }
    },

    setCollection: async (collection, values) => {
      const current = await db.query<Record<string, unknown>>(
        sql`select * from ${collectionTable} where collection = ${collection}`,
      )
      const enabled =
        values.enabled !== undefined ? values.enabled : toNullableBool(current.rows[0]?.['enabled'])
      const moderationRequired =
        values.moderationRequired !== undefined
          ? values.moderationRequired
          : toNullableBool(current.rows[0]?.['moderation_required'])
      const at = now().toISOString()

      if (current.rows[0] === undefined) {
        await db.query(sql`
          insert into ${collectionTable} (collection, enabled, moderation_required, updated_at)
          values (${collection}, ${fromNullableBool(enabled, d)}, ${fromNullableBool(moderationRequired, d)}, ${at})`)
      } else {
        await db.query(sql`
          update ${collectionTable}
          set enabled = ${fromNullableBool(enabled, d)}, moderation_required = ${fromNullableBool(moderationRequired, d)}, updated_at = ${at}
          where collection = ${collection}`)
      }
      return { collection, enabled, moderationRequired }
    },

    getEntry: async (collection, entryId) => {
      const result = await db.query<Record<string, unknown>>(
        sql`select * from ${entryTable} where collection = ${collection} and entry_id = ${entryId}`,
      )
      const row = result.rows[0]
      if (row === undefined) return { collection, entryId, enabled: null }
      return { collection, entryId, enabled: toNullableBool(row['enabled']) }
    },

    setEntry: async (collection, entryId, enabled) => {
      const existing = await db.query<Record<string, unknown>>(
        sql`select 1 as found from ${entryTable} where collection = ${collection} and entry_id = ${entryId}`,
      )
      const at = now().toISOString()
      if (existing.rows[0] === undefined) {
        await db.query(sql`
          insert into ${entryTable} (collection, entry_id, enabled, updated_at)
          values (${collection}, ${entryId}, ${fromNullableBool(enabled, d)}, ${at})`)
      } else {
        await db.query(sql`
          update ${entryTable} set enabled = ${fromNullableBool(enabled, d)}, updated_at = ${at}
          where collection = ${collection} and entry_id = ${entryId}`)
      }
      return { collection, entryId, enabled }
    },
  }
}

/**
 * Resolves the whole inheritance chain: entry override, else collection
 * override, else the site default. One function, called from the public
 * POST route, the entry sidebar toggle and the settings screen alike, so
 * "is this entry open to comments" never has two different answers.
 */
export function effectiveEnabled(
  entry: EntryCommentSettings | null,
  collection: CollectionCommentSettings | null,
  siteDefault: boolean,
): boolean {
  if (entry?.enabled !== null && entry?.enabled !== undefined) return entry.enabled
  if (collection?.enabled !== null && collection?.enabled !== undefined) return collection.enabled
  return siteDefault
}

export function effectiveModerationRequired(
  collection: CollectionCommentSettings | null,
  siteDefault: boolean,
): boolean {
  if (collection?.moderationRequired !== null && collection?.moderationRequired !== undefined) {
    return collection.moderationRequired
  }
  return siteDefault
}
