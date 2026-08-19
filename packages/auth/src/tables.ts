import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

export const TABLES = {
  users: 'cogenta_users',
  credentials: 'cogenta_credentials',
  sessions: 'cogenta_sessions',
  loginAttempts: 'cogenta_login_attempts',
  passwordResets: 'cogenta_password_resets',
  auditLog: 'cogenta_audit_log',
  apiKeys: 'cogenta_api_keys',
  /** Aggregated per-day call counts (fiche 20 task 4) — never a line-per-call log. */
  apiKeyUsage: 'cogenta_api_key_usage',
  /**
   * Fiche 21 task 5: a singleton row naming the last entry a `prune()` call
   * removed. Never touched by anything but `prune()` and read by
   * `verify()`/`verifyRange()`, which trust it as the chain's new starting
   * point instead of requiring `previousHash: null` — a truncated chain's
   * oldest surviving row legitimately chains to a hash that is no longer in
   * the table.
   */
  auditGenesis: 'cogenta_audit_genesis',
  /**
   * Fiche 21 task 3: the one row a scheduled integrity check reads and
   * writes — last outcome, last checkpoint, whether the chain is currently
   * believed broken. Owned by `createAuditIntegrityStore` (`audit-integrity.ts`).
   */
  auditIntegrity: 'cogenta_audit_integrity',
} as const

/** `varchar` on Postgres/MySQL, `text` on SQLite — encapsulated once, here. */
function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function booleanColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'postgres' ? 'boolean' : 'tinyint')
}

/**
 * Every table this package owns.
 *
 * Run once, at startup, the same way the migration engine and the queue driver
 * do it: `create table if not exists`, so a fresh install and an upgrade take
 * the same path.
 */
export async function ensureAuthTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const users = identifier(TABLES.users, d)
  const credentials = identifier(TABLES.credentials, d)
  const sessions = identifier(TABLES.sessions, d)
  const loginAttempts = identifier(TABLES.loginAttempts, d)
  const passwordResets = identifier(TABLES.passwordResets, d)
  const auditLog = identifier(TABLES.auditLog, d)
  const apiKeys = identifier(TABLES.apiKeys, d)
  const apiKeyUsage = identifier(TABLES.apiKeyUsage, d)
  const auditGenesis = identifier(TABLES.auditGenesis, d)
  const auditIntegrity = identifier(TABLES.auditIntegrity, d)
  const t512 = textColumn(d, 512)
  const t255 = textColumn(d, 255)
  const t64 = textColumn(d, 64)
  const bool = booleanColumn(d)

  await db.query(sql`
    create table if not exists ${users} (
      id ${t64} not null primary key,
      email ${t255} not null unique,
      -- An open set of role names (contract A), stored as JSON text on every
      -- dialect for the same reason the migration engine stores timestamps as
      -- text: one representation that means the same thing everywhere, rather
      -- than a native array type only Postgres has.
      roles text not null,
      status ${t64} not null,
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  // Public profile (fiche 17 task 3), added to a table that may already exist
  // on an upgraded site — same additive pattern as the API key columns below.
  // All four are nullable: "not set" is the default for every account that
  // predates this column, not an empty string to backfill.
  await addColumnIfMissing(db, users, 'display_name', t255)
  await addColumnIfMissing(db, users, 'avatar_media_id', t64)
  await addColumnIfMissing(db, users, 'bio', sql`text`)
  await addColumnIfMissing(db, users, 'locale', t64)

  await db.query(sql`
    create table if not exists ${credentials} (
      id ${t64} not null primary key,
      user_id ${t64} not null,
      kind ${t64} not null,
      -- Kind-specific, never interpreted at this layer:
      --   password: { hash }
      --   totp:     { secret, verified }
      --   webauthn: { credentialId, publicKey, counter, transports, label }
      data text not null,
      created_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${sessions} (
      id ${t64} not null primary key,
      user_id ${t64} not null,
      -- The bearer token itself is never stored, only its hash — the same
      -- reasoning as a password, applied to the thing that stands in for one
      -- after login. A leaked database does not hand out live sessions.
      token_hash ${t512} not null unique,
      label ${t255},
      created_at ${t64} not null,
      expires_at ${t64} not null,
      last_seen_at ${t64} not null,
      revoked ${bool} not null
    )`)

  await db.query(sql`
    create table if not exists ${loginAttempts} (
      id ${t64} not null primary key,
      -- Keyed by subject (email or IP), not by user id: an attacker probing a
      -- nonexistent email must be rate-limited too, or enumeration is free.
      subject ${t255} not null,
      at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${passwordResets} (
      id ${t64} not null primary key,
      user_id ${t64} not null,
      -- Hashed like a session token: a leaked table must not hand out a live
      -- account takeover. Unique so the same token can never name two rows.
      token_hash ${t512} not null unique,
      created_at ${t64} not null,
      expires_at ${t64} not null,
      -- Null while the token is still usable; stamped once, and the stamping
      -- is what makes the token single-use (see resets.ts).
      used_at ${t64}
    )`)

  await db.query(sql`
    create table if not exists ${auditLog} (
      id ${t64} not null primary key,
      at ${t64} not null,
      actor_id ${t64},
      actor_roles text not null,
      action ${t255} not null,
      collection_name ${t255},
      entry_id ${t64},
      diff text,
      hash ${t64} not null,
      previous_hash ${t64}
    )`)

  // Fiche 21 task 1: which content version this entry's action produced, so
  // its detail view can ask `GET .../diff?from={version-1}&to={version}`
  // instead of re-deriving one. Deliberately **not** part of `computeHash`'s
  // canonical fields (see `audit.ts`) — adding a column to the hash would
  // change the hash of every entry a site already has, and `verify()` would
  // call its own untouched history broken the moment this code runs. A
  // plain `alter table` rather than a place in the `create table` above,
  // because that statement only runs for a table that does not exist yet —
  // an upgrade's `cogenta_audit_log` already does, and would never see the
  // column otherwise. No portable `add column if not exists` across all
  // three dialects (SQLite has none at all), so — like `createIndexIfMissing`
  // just below — this is a `try`, not a check.
  await db.query(sql`alter table ${auditLog} add column version ${t64}`).catch(() => undefined)

  await db.query(sql`
    create table if not exists ${apiKeys} (
      id ${t64} not null primary key,
      name ${t255} not null,
      -- Hashed like a session token (sha256 over a 256-bit random secret):
      -- unlike a password, this secret is never chosen by a person, so there
      -- is no low-entropy guess for a slow, memory-hard hash to protect
      -- against. A leaked table still hands out nothing live.
      key_hash ${t512} not null unique,
      -- The first 12 characters of the raw key, stored in the clear so a
      -- list of keys is recognisable without ever showing the rest again.
      key_prefix ${t64} not null,
      -- An open set of role names, exactly like a user's roles (contract A)
      -- — a key acts as a machine actor scoped to exactly these roles, never
      -- to more than it was granted.
      scope text not null,
      created_by ${t64},
      created_at ${t64} not null,
      expires_at ${t64},
      revoked_at ${t64},
      last_used_at ${t64},
      -- Requests per minute this key may make (fiche 20 task 3). Nullable so
      -- a row written before this column existed still parses: fromRow()
      -- treats null as "the default quota", the same courtesy expires_at
      -- already gets for "never".
      rate_limit_per_minute integer,
      -- Set when this key was replaced by a rotation (fiche 20 task 2): the
      -- id of the new key. expires_at is what actually ends this key's
      -- grace window — this column only makes that window visible as
      -- "superseded", rather than indistinguishable from an ordinary expiry.
      superseded_by ${t64}
    )`)

  // Both columns above are additive for a database that already had this
  // table before fiche 20: `create table if not exists` never touches an
  // existing table, so an upgrade needs its own statement. There is no
  // portable "add column if not exists" (the same reason indexes below use
  // catch-and-ignore) — the failure this swallows is exactly "already there".
  await addColumnIfMissing(db, apiKeys, 'rate_limit_per_minute', sql`integer`)
  await addColumnIfMissing(db, apiKeys, 'superseded_by', sql`${t64}`)

  await db.query(sql`
    create table if not exists ${apiKeyUsage} (
      id ${t64} not null primary key,
      key_id ${t64} not null,
      -- One row per key per UTC calendar day, incremented on every
      -- successful verification. Aggregated by construction — a line per
      -- call would be an absurd volume for a key doing hundreds of requests
      -- a minute (fiche 20 task 4).
      day ${textColumn(d, 10)} not null,
      count integer not null
    )`)

  // Fiche 21 task 5: at most one row, id `'singleton'`. Absent means no
  // `prune()` has ever run, which `verify()`/`verifyRange()` read as "the
  // chain starts at its very first entry" — the same behaviour as before
  // this table existed.
  await db.query(sql`
    create table if not exists ${auditGenesis} (
      id ${t64} not null primary key,
      entry_id ${t64} not null,
      entry_at ${t64} not null,
      entry_hash ${t64} not null,
      pruned_count ${t64} not null,
      pruned_at ${t64} not null
    )`)

  // Fiche 21 task 3: at most one row, id `'singleton'` — the scheduled
  // integrity check's memory of what it last found, surviving a restart the
  // same way the scheduled-publication tick's own state does not need to
  // (that one replays from the content table itself; this one would
  // otherwise have to replay the whole log on every restart).
  await db.query(sql`
    create table if not exists ${auditIntegrity} (
      id ${t64} not null primary key,
      state ${t64} not null,
      checkpoint_id ${t64},
      checkpoint_at ${t64},
      checkpoint_hash ${t64},
      entries_checked ${t64},
      last_checked_at ${t64},
      last_mode ${t64},
      last_full_checked_at ${t64},
      broken_at ${t64},
      broken_entry_id ${t64},
      broken_message text
    )`)

  await createIndexIfMissing(db, 'cogenta_credentials_user', credentials, sql`(user_id)`)
  await createIndexIfMissing(db, 'cogenta_sessions_user', sessions, sql`(user_id)`)
  await createIndexIfMissing(
    db,
    'cogenta_login_attempts_subject_at',
    loginAttempts,
    sql`(subject, at)`,
  )
  await createIndexIfMissing(db, 'cogenta_password_resets_user', passwordResets, sql`(user_id)`)
  await createUniqueIndexIfMissing(
    db,
    'cogenta_api_key_usage_key_day',
    apiKeyUsage,
    sql`(key_id, day)`,
  )
}

/**
 * Additive column for a table that may already exist on an upgraded site
 * (fiche 20 task 3's rate-limit/rotation columns, fiche 17 task 3's profile
 * fields): same catch-and-ignore shape as `createIndexIfMissing` below, for
 * the same reason — no dialect here has a portable "add column if not
 * exists".
 */
async function addColumnIfMissing(
  db: DatabaseHandle,
  table: SqlFragment,
  column: string,
  type: SqlFragment,
): Promise<void> {
  await db
    .query(sql`alter table ${table} add column ${identifier(column, db.dialect)} ${type}`)
    .catch(() => undefined) // already there — no portable "add column if not exists"
}

async function createIndexIfMissing(
  db: DatabaseHandle,
  name: string,
  table: SqlFragment,
  columns: SqlFragment,
): Promise<void> {
  await db
    .query(sql`create index ${identifier(name, db.dialect)} on ${table} ${columns}`)
    .catch(() => undefined) // already there — no portable "if not exists" for indexes
}

async function createUniqueIndexIfMissing(
  db: DatabaseHandle,
  name: string,
  table: SqlFragment,
  columns: SqlFragment,
): Promise<void> {
  await db
    .query(sql`create unique index ${identifier(name, db.dialect)} on ${table} ${columns}`)
    .catch(() => undefined) // already there — no portable "if not exists" for indexes
}
