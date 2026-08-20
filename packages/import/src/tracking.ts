import { CogentaError, type DatabaseHandle, identifier, limit, newId, sql } from '@cogenta/core'

/**
 * The import bookkeeping tables (fiche 25, tasks 1, 3 and 4).
 *
 * Two tables, both owned by `@cogenta/import` alone — never a field on
 * contract A. `provenance`/`provenanceDetail` were the plan's first idea
 * (task 4's "décision à prendre"), but `provenanceDetail` is a fixed,
 * `strictObject` shape (`{ agent, model, at, prompt? }`, contract A) with no
 * room for an import identifier, and stuffing one into `agent` would misuse a
 * field that means "which AI agent wrote this" for content that is not
 * AI-generated at all. A side table costs nothing on the figé contract and is
 * exactly the shape `createRedirectStore` already uses for the same reason —
 * bookkeeping that is about *how* content arrived, not what it is.
 *
 * `cogenta_import_runs` is one row per analyze/apply cycle: its `status`
 * tracks the two-phase flow the lot asks for ('analyzed' → nothing written
 * yet; 'running'/'done'/'failed' → apply is or was in progress; 'cancelled'
 * → undone). `cogenta_import_items` is one row per entry actually created,
 * which is what makes both resume (task 3: skip a `sourceId` already
 * recorded) and undo (task 4: trash everything recorded for a run) possible
 * without touching the entries themselves.
 */

export const IMPORT_RUNS_TABLE = 'cogenta_import_runs'
export const IMPORT_ITEMS_TABLE = 'cogenta_import_items'

export const IMPORT_SOURCES = ['wordpress', 'csv', 'json', 'rss'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

export const IMPORT_RUN_STATUSES = [
  'analyzed',
  'queued',
  'running',
  'done',
  'failed',
  'cancelled',
] as const
export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number]

export interface ImportRun {
  readonly id: string
  readonly source: ImportSource
  readonly status: ImportRunStatus
  readonly createdBy: string | null
  readonly createdAt: string
  readonly updatedAt: string
  /** The analyzed preview report — what `analyze*` produced, unchanged by apply. */
  readonly analysis: unknown
  /** Caller-supplied field/collection mapping (task 2), stored so a resumed apply reuses the same one. */
  readonly mapping: unknown
  /** Progress counters, updated as apply runs — `{ processed, total }`. */
  readonly progress: { readonly processed: number; readonly total: number }
  /** The final report, present once `status` is `'done'` or `'failed'`. */
  readonly report: unknown
  readonly error: string | null
}

export interface CreateImportRunInput {
  readonly source: ImportSource
  readonly createdBy: string | null
  readonly analysis: unknown
  readonly mapping?: unknown
  readonly total?: number
}

export interface ImportItem {
  readonly runId: string
  readonly sourceId: string
  readonly collection: string
  readonly entryId: string
  readonly createdAt: string
}

export interface ImportTrackingStore {
  ensureTables(): Promise<void>
  createRun(input: CreateImportRunInput): Promise<ImportRun>
  getRun(id: string): Promise<ImportRun | null>
  listRuns(options?: { readonly limit?: number }): Promise<ImportRun[]>
  updateRun(
    id: string,
    patch: Partial<Pick<ImportRun, 'status' | 'progress' | 'report' | 'error' | 'mapping'>>,
  ): Promise<ImportRun>
  /** Records one written entry. Idempotent: re-recording the same `(runId, sourceId)` is a no-op. */
  recordItem(item: Omit<ImportItem, 'createdAt'>): Promise<void>
  /** The `sourceId`s already recorded for a run — what a resumed apply must skip. */
  doneSourceIds(runId: string): Promise<Set<string>>
  listItems(runId: string): Promise<ImportItem[]>
}

interface RunRow {
  readonly id: string
  readonly source: string
  readonly status: string
  readonly created_by: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly analysis: string | null
  readonly mapping: string | null
  readonly processed: number
  readonly total: number
  readonly report: string | null
  readonly error: string | null
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function toRun(row: RunRow): ImportRun {
  return {
    id: row.id,
    source: row.source as ImportSource,
    status: row.status as ImportRunStatus,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analysis: parseJson(row.analysis),
    mapping: parseJson(row.mapping),
    progress: { processed: Number(row.processed), total: Number(row.total) },
    report: parseJson(row.report),
    error: row.error,
  }
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'IMPORT_RUN_NOT_FOUND',
    message: `No import run "${id}" exists.`,
    hint: 'Analyze a source first — apply, status and cancel all operate on the run id that returns.',
    details: { id },
  })
}

export interface CreateImportTrackingStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => number
}

export function createImportTrackingStore(
  options: CreateImportTrackingStoreOptions,
): ImportTrackingStore {
  const { db } = options
  const now = options.now ?? Date.now
  const runsTable = identifier(IMPORT_RUNS_TABLE, db.dialect)
  const itemsTable = identifier(IMPORT_ITEMS_TABLE, db.dialect)
  let ready = false

  async function ensureTables(): Promise<void> {
    if (ready) return

    await db.query(sql`
      create table if not exists ${runsTable} (
        id varchar(64) not null primary key,
        source varchar(32) not null,
        status varchar(16) not null,
        created_by varchar(64),
        created_at varchar(40) not null,
        updated_at varchar(40) not null,
        analysis text,
        mapping text,
        processed integer not null default 0,
        total integer not null default 0,
        report text,
        error text
      )`)

    await db.query(sql`
      create table if not exists ${itemsTable} (
        run_id varchar(64) not null,
        source_id varchar(255) not null,
        collection varchar(255) not null,
        entry_id varchar(64) not null,
        created_at varchar(40) not null
      )`)

    await db
      .query(
        sql`create unique index ${identifier(`${IMPORT_ITEMS_TABLE}_run_source`, db.dialect)}
            on ${itemsTable} (run_id, source_id)`,
      )
      .catch(() => undefined) // already there — no dialect spells "if not exists" the same way

    ready = true
  }

  async function createRun(input: CreateImportRunInput): Promise<ImportRun> {
    await ensureTables()
    const id = newId()
    const timestamp = new Date(now()).toISOString()

    await db.query(sql`
      insert into ${runsTable}
        (id, source, status, created_by, created_at, updated_at, analysis, mapping, processed, total, report, error)
      values (
        ${id}, ${input.source}, ${'analyzed'}, ${input.createdBy}, ${timestamp}, ${timestamp},
        ${JSON.stringify(input.analysis)},
        ${input.mapping === undefined ? null : JSON.stringify(input.mapping)},
        ${0}, ${input.total ?? 0}, ${null}, ${null}
      )`)

    const created = await getRun(id)
    if (created === null) throw notFound(id)
    return created
  }

  async function getRun(id: string): Promise<ImportRun | null> {
    await ensureTables()
    const found = await db.query<RunRow>(sql`
      select * from ${runsTable} where id = ${id} limit ${limit(1)}`)
    const row = found.rows[0]
    return row === undefined ? null : toRun(row)
  }

  async function listRuns(listOptions: { readonly limit?: number } = {}): Promise<ImportRun[]> {
    await ensureTables()
    const found = await db.query<RunRow>(sql`
      select * from ${runsTable} order by created_at desc limit ${limit(listOptions.limit ?? 50)}`)
    return found.rows.map(toRun)
  }

  async function updateRun(
    id: string,
    patch: Partial<Pick<ImportRun, 'status' | 'progress' | 'report' | 'error' | 'mapping'>>,
  ): Promise<ImportRun> {
    await ensureTables()
    const current = await getRun(id)
    if (current === null) throw notFound(id)

    const next = {
      status: patch.status ?? current.status,
      processed: patch.progress?.processed ?? current.progress.processed,
      total: patch.progress?.total ?? current.progress.total,
      report: patch.report === undefined ? current.report : patch.report,
      error: patch.error === undefined ? current.error : patch.error,
      mapping: patch.mapping === undefined ? current.mapping : patch.mapping,
    }

    await db.query(sql`
      update ${runsTable} set
        status = ${next.status},
        updated_at = ${new Date(now()).toISOString()},
        processed = ${next.processed},
        total = ${next.total},
        report = ${next.report === null ? null : JSON.stringify(next.report)},
        error = ${next.error},
        mapping = ${next.mapping === null ? null : JSON.stringify(next.mapping)}
      where id = ${id}`)

    const updated = await getRun(id)
    if (updated === null) throw notFound(id)
    return updated
  }

  async function recordItem(item: Omit<ImportItem, 'createdAt'>): Promise<void> {
    await ensureTables()
    await db
      .query(sql`
        insert into ${itemsTable} (run_id, source_id, collection, entry_id, created_at)
        values (${item.runId}, ${item.sourceId}, ${item.collection}, ${item.entryId}, ${new Date(now()).toISOString()})`)
      .catch(() => undefined) // unique (run_id, source_id): a retried item after a crash is a no-op, not an error
  }

  async function doneSourceIds(runId: string): Promise<Set<string>> {
    await ensureTables()
    const found = await db.query<{ source_id: string }>(sql`
      select source_id from ${itemsTable} where run_id = ${runId}`)
    return new Set(found.rows.map((row) => row.source_id))
  }

  async function listItems(runId: string): Promise<ImportItem[]> {
    await ensureTables()
    const found = await db.query<{
      run_id: string
      source_id: string
      collection: string
      entry_id: string
      created_at: string
    }>(sql`select * from ${itemsTable} where run_id = ${runId} order by created_at asc`)
    return found.rows.map((row) => ({
      runId: row.run_id,
      sourceId: row.source_id,
      collection: row.collection,
      entryId: row.entry_id,
      createdAt: row.created_at,
    }))
  }

  return {
    ensureTables,
    createRun,
    getRun,
    listRuns,
    updateRun,
    recordItem,
    doneSourceIds,
    listItems,
  }
}
