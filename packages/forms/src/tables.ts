import {
  type DatabaseDialect,
  type DatabaseHandle,
  identifier,
  type SqlFragment,
  sql,
  unsafeRaw,
} from '@cogenta/core'

/**
 * Every table contract G owns, prefixed `cogenta_forms_` for the same reason
 * `@cogenta/commerce` prefixes its own: a site's content collections are
 * named after what *it* declares, so a site that also has a `contact`
 * collection must not collide with the `contact` form definition.
 */
export const TABLES = {
  definitions: 'cogenta_forms_definitions',
  submissions: 'cogenta_forms_submissions',
  autoresponderSends: 'cogenta_forms_autoresponder_sends',
  submissionNotes: 'cogenta_forms_submission_notes',
} as const

function textColumn(dialect: DatabaseDialect, length: number): SqlFragment {
  return unsafeRaw(dialect === 'sqlite' ? 'text' : `varchar(${length})`)
}

function booleanColumn(dialect: DatabaseDialect): SqlFragment {
  return unsafeRaw(dialect === 'postgres' ? 'boolean' : 'tinyint')
}

function longTextColumn(): SqlFragment {
  return unsafeRaw('text')
}

/**
 * Creates everything this package owns, idempotently — the same
 * `create table if not exists` shape `ensureCommerceTables` uses, and for
 * the same reason: contract G is not part of contract A's migration engine,
 * so a site that never builds a form never pays for these tables.
 */
export async function ensureFormsTables(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const t255 = textColumn(d, 255)
  const t64 = textColumn(d, 64)
  const bool = booleanColumn(d)
  const long = longTextColumn()

  await db.query(sql`
    create table if not exists ${identifier(TABLES.definitions, d)} (
      id ${t64} not null primary key,
      name ${t255} not null unique,
      label ${t255} not null,
      -- The field list, serialised. Contract G's own vocabulary (nine kinds,
      -- fixed), not a client-defined free-form JSON blob the way fiche 03
      -- warns against for contract A's json field — this is this package's
      -- own closed schema, validated by validate.ts on every write.
      fields ${long} not null,
      active ${bool} not null,
      confirmation_message ${long} not null,
      redirect_to ${t255},
      notify_emails ${long} not null,
      autoresponder ${long} not null,
      retain_days ${t64} not null,
      created_at ${t64} not null,
      updated_at ${t64} not null
    )`)

  await db.query(sql`
    create table if not exists ${identifier(TABLES.submissions, d)} (
      id ${t64} not null primary key,
      form_id ${t64} not null,
      form_name ${t255} not null,
      values_json ${long} not null,
      consents_json ${long} not null,
      status ${t64} not null,
      -- sha256 hex of the submitting IP. Never the address itself.
      ip_hash ${t64},
      referrer ${t255},
      user_agent ${t255},
      submitted_at ${t64} not null
    )`)

  // Rate-limits the autoresponder per recipient address (fiche 16 § pièges:
  // "l'accusé de réception est un relais de spam potentiel"), independent of
  // the generic per-IP submission limiter — a script rotating source IPs but
  // reusing a victim's e-mail must still be capped.
  await db.query(sql`
    create table if not exists ${identifier(TABLES.autoresponderSends, d)} (
      id ${t64} not null primary key,
      email ${t255} not null,
      sent_at ${t64} not null
    )`)

  // Fiche 47 task 8 — an operator's own note on a submission, never shown to
  // the visitor and never exported: a separate table (not a column on the
  // submission row) because a submission can carry several, each with its
  // own author and timestamp.
  await db.query(sql`
    create table if not exists ${identifier(TABLES.submissionNotes, d)} (
      id ${t64} not null primary key,
      submission_id ${t64} not null,
      author_id ${t64},
      author_label ${t255} not null,
      body ${long} not null,
      created_at ${t64} not null
    )`)

  // Fiche 47 tasks 2/4/10 — three columns added to an already-shipped table.
  // `create table if not exists` above is a no-op against a database that
  // predates them, so they are grown in place the same way every other
  // in-place table growth in this codebase is (`menu-tables.ts`'s own
  // comment says why): failure here means the column already exists, the
  // only realistic cause once this function has already run once, so it is
  // swallowed exactly like the index statements below.
  const columnStatements: SqlFragment[] = [
    sql`alter table ${identifier(TABLES.definitions, d)} add column ${identifier('steps', d)} ${long}`,
    sql`alter table ${identifier(TABLES.definitions, d)} add column ${identifier('notify_channels', d)} ${long}`,
    sql`alter table ${identifier(TABLES.definitions, d)} add column ${identifier('captcha', d)} ${long}`,
  ]
  for (const statement of columnStatements) {
    await db.query(statement).catch(() => undefined)
  }

  await ensureIndexes(db)
}

async function ensureIndexes(db: DatabaseHandle): Promise<void> {
  const d = db.dialect
  const wanted: readonly (readonly [string, string, string])[] = [
    ['cogenta_forms_submissions_form', TABLES.submissions, 'form_id'],
    ['cogenta_forms_submissions_status', TABLES.submissions, 'status'],
    ['cogenta_forms_submissions_submitted_at', TABLES.submissions, 'submitted_at'],
    ['cogenta_forms_autoresponder_email', TABLES.autoresponderSends, 'email'],
    ['cogenta_forms_notes_submission', TABLES.submissionNotes, 'submission_id'],
  ]

  for (const [name, table, column] of wanted) {
    const statement = sql`create index ${identifier(name, d)} on ${identifier(table, d)} (${identifier(column, d)})`
    try {
      await db.query(
        d === 'mysql'
          ? statement
          : sql`create index if not exists ${identifier(name, d)} on ${identifier(table, d)} (${identifier(column, d)})`,
      )
    } catch {
      // Already there — MySQL before 8.0.29 has no `if not exists` for
      // indexes, so a duplicate-index error here is the only failure this
      // swallows (same discipline as `ensureCommerceTables`).
    }
  }
}
