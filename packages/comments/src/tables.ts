import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

/**
 * Every table contract F owns.
 *
 * `cogenta_comments_*`, not `cogenta_*` — the same reasoning as commerce's
 * `TABLES` comment (ADR-0025): a comment is not a collection entry, so it
 * must never collide with a site's own `comment`-named collection, and it
 * carries none of the corbeille/version/translation machinery contract A's
 * `entries` table does. A site that never receives a comment never creates
 * these tables.
 */
export const TABLES = {
  comments: 'cogenta_comments_comments',
  postAttempts: 'cogenta_comments_post_attempts',
  collectionSettings: 'cogenta_comments_collection_settings',
  entrySettings: 'cogenta_comments_entry_settings',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function longTextColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'postgres' ? 'text' : dialect === 'mysql' ? 'mediumtext' : 'text')
}

function booleanColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'postgres' ? 'boolean' : 'tinyint')
}

/**
 * Creates everything this package owns, idempotently — same shape as
 * `ensureCommerceTables`: `create table if not exists`, run once at startup,
 * fresh install and upgrade take the same path. Not part of contract A's
 * migration engine (ADR-0025's whole point).
 *
 * `dropCommentsTables` is the reverse of this function — see it for why a
 * migration this package owns is still reversible even though it is not
 * expressed as an `up`/`down` pair inside contract A's own engine.
 */
export async function ensureCommentsTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const t2000 = textColumn(d, 2000)
  const t255 = textColumn(d, 255)
  const t64 = textColumn(d, 64)
  const longText = longTextColumn(d)
  const bool = booleanColumn(d)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.comments, d)} (
      id ${t64} not null primary key,
      -- Target: which entry this comment is attached to. Not a foreign key
      -- (same reasoning as commerce's content_collection/content_entry_id):
      -- the entries table is created by contract A's migration engine from a
      -- schema this package never sees.
      collection ${t255} not null,
      entry_id ${t64} not null,
      locale ${t64},
      -- Threading: null for a top-level comment.
      parent_id ${t64},
      -- Author: a signed-in account (user_id set, name/email/site from the
      -- account) OR a visitor (user_id null, name/email/site supplied).
      -- Never both unset — the store enforces this, not a CHECK constraint,
      -- because the two dialects spell CHECK differently and application code
      -- gives one honest error message either way.
      user_id ${t64},
      author_name ${t255} not null,
      -- Never displayed in the admin without hashing on read — RGPD.
      author_email ${t255} not null,
      author_url ${t2000},
      -- Text only (ADR-0025, R3): never HTML. Enforced at write time, not
      -- just at render time — the first defense against stored XSS is never
      -- storing markup at all.
      body ${longText} not null,
      status ${t64} not null,
      -- sha256, never the address itself (RGPD, ADR-0025).
      ip_hash ${t64},
      user_agent ${t255},
      -- Set by assist.moderate (fiche 15 task 4) — an indicator, never a
      -- reason to act. Null until a moderator runs the check.
      moderation_flagged ${bool},
      moderation_severity ${t64},
      moderation_reason ${t2000},
      provenance ${t64} not null,
      created_at ${t64} not null,
      updated_at ${t64} not null,
      moderated_at ${t64},
      moderated_by ${t64}
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.postAttempts, d)} (
      id ${t64} not null primary key,
      -- Either an ip_hash bucket or a target (collection:entryId) bucket —
      -- two independent limiter dimensions sharing one table, distinguished
      -- by 'kind'. See rate-limit.ts.
      kind ${t64} not null,
      subject ${t255} not null,
      at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.collectionSettings, d)} (
      collection ${t255} not null primary key,
      -- Tri-state via nullable columns: null means "inherit the site default"
      -- (discussion.* in @cogenta/schema's site settings registry).
      enabled ${bool},
      moderation_required ${bool},
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.entrySettings, d)} (
      collection ${t255} not null,
      entry_id ${t64} not null,
      -- Same tri-state: null inherits the collection setting, which in turn
      -- inherits the site default.
      enabled ${bool},
      updated_at ${t64} not null,
      primary key (collection, entry_id)
    )`)

  await ensureIndexes(db)
}

async function ensureIndexes(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const wanted: readonly (readonly [string, string, string])[] = [
    ['cogenta_comments_target', TABLES.comments, 'collection'],
    ['cogenta_comments_parent', TABLES.comments, 'parent_id'],
    ['cogenta_comments_status', TABLES.comments, 'status'],
    ['cogenta_comments_attempts_subject', TABLES.postAttempts, 'subject'],
  ]

  for (const [name, table, column] of wanted) {
    try {
      await db.query(
        d === 'mysql'
          ? sql`create index ${identifier(name, d)} on ${identifier(table, d)} (${identifier(column, d)})`
          : sql`create index if not exists ${identifier(name, d)} on ${identifier(table, d)} (${identifier(column, d)})`,
      )
    } catch {
      // Already there — the only failure this swallows (see commerce's
      // identical comment in tables.ts for why MySQL needs the try/catch).
    }
  }
}

/**
 * The reverse of `ensureCommentsTables` — proof this package's migration is
 * reversible (AGENTS.md § Migrations), even though it is expressed as
 * idempotent DDL rather than a tracked `up`/`down` pair the way contract A's
 * own engine works. `up` then `down` then `up` leaves the database able to
 * take writes again with no leftover state — the same invariant
 * `write-migration`'s skill asks for, proven by `test/tables.test.ts`.
 *
 * Destructive: every comment, every rate-limit bucket and every per-entry
 * discussion override is gone. Callers (the CLI, a test) are the ones who
 * decide when that is acceptable — this function never runs on its own.
 */
export async function dropCommentsTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  for (const table of [
    TABLES.entrySettings,
    TABLES.collectionSettings,
    TABLES.postAttempts,
    TABLES.comments,
  ]) {
    await db.query(sql`drop table if exists ${identifier(table, d)}`)
  }
}
