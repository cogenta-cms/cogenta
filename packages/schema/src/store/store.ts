import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
  limit as sqlLimit,
} from '@cogenta/core'
import { newId as uuidv7 } from '../id.js'
import {
  type CollectionDefinition,
  type ContentStatus,
  DEFAULT_TRASH_RETAIN_DAYS,
  type Provenance,
} from '../types.js'
import { isColumnless } from './columns.js'
import { type Cursor, decodeCursor, encodeCursor } from './cursor.js'
import { type ContentDiff, diffContent } from './diff.js'
import { joinFragments, valueList } from './fragments.js'
import { blocksTable, columnFor, entriesTable, relationTable, versionsTable } from './naming.js'
import { relationsOf } from './tables.js'
import type {
  BlockZones,
  ContentBlock,
  ContentEntry,
  ContentValues,
  CreateInput,
  DuplicateInput,
  EntryState,
  ListOptions,
  LocaleResolution,
  Page,
  PurgeReport,
  ReadOptions,
  ResolveLocaleOptions,
  SortOrder,
  StatusCounts,
  TrashFilter,
  TrashOptions,
  UpdateInput,
  VersionSummary,
} from './types.js'
import { decodeFieldValue, normaliseBlocks, normaliseValues } from './values.js'

/**
 * The persistence layer of a collection.
 *
 * Three ideas hold it together, and everything else follows from them:
 *
 * 1. **The entry table holds the live state** — what the public renderer reads.
 *    A draft of an already-published entry is a row in the versions table, not a
 *    mutation of the live row. That is what makes "the public role can never
 *    reach a draft" a property of the storage rather than of a filter someone
 *    has to remember to write.
 * 2. **Blocks are rows, keyed by `(entry, version, zone, key)`** (contract A).
 *    The live blocks are those at the entry's own version, so publishing a draft
 *    is a version number moving, not a block rewrite.
 * 3. **One row per locale** (ADR-0014), so `status`, `version` and publication
 *    are per language by construction, not by convention.
 */

export interface ContentStoreOptions {
  readonly db: DatabaseHandle
  readonly collection: CollectionDefinition
  /**
   * The other collections of the site, so `delete()` can enforce `restrict`.
   *
   * Trashing is not a `DELETE`, so the foreign key cannot refuse it any more
   * (ADR-0022) — the check has to be made in application code, and this is
   * what makes it possible: a store only knows its own collection otherwise.
   *
   * Left out, only self-references are checked. That degrades honestly rather
   * than silently: nothing is destroyed, since `purge()` still meets the real
   * foreign key. Every real runtime (`serve.ts`) passes the whole set.
   */
  readonly siblings?: readonly CollectionDefinition[]
  /** The locale an entry gets when the caller does not say. */
  readonly defaultLocale?: string
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => Date
  readonly newId?: () => string
}

export interface ContentStore<TValues extends ContentValues = ContentValues> {
  create(input: CreateInput<TValues>): Promise<ContentEntry<TValues>>
  /** Copies an entry into a new, independent draft. See the implementation for what is deliberately not copied. */
  duplicate(id: string, input?: DuplicateInput<TValues>): Promise<ContentEntry<TValues>>
  read(id: string, options?: ReadOptions): Promise<ContentEntry<TValues> | null>
  update(id: string, input: UpdateInput<TValues>): Promise<ContentEntry<TValues>>
  /**
   * Moves an entry to the trash (`schema@2.0`, ADR-0022).
   *
   * **This used to be a hard `DELETE`.** It now writes `deletedAt` and leaves
   * every row — versions, blocks, join rows, the `translation_of` of its
   * translations — exactly where it was, which is the only way `untrash()` can
   * give back precisely what was taken.
   *
   * A collection declared `trash: false` keeps the old behaviour: `delete()`
   * is `purge()`.
   */
  delete(id: string): Promise<boolean>
  /** Takes an entry back out of the trash, with the status it went in with. */
  untrash(id: string): Promise<ContentEntry<TValues>>
  /** The real `DELETE`, and the only one. What `delete()` did before 2.0. */
  purge(id: string): Promise<boolean>
  /** Purges what has sat in the trash longer than `trash.retainDays`. */
  purgeExpired(): Promise<PurgeReport>
  list(options?: ListOptions): Promise<Page<ContentEntry<TValues>>>
  /**
   * Per-status row counts, and how many sit in the trash — one `GROUP BY` and
   * one trash count, never a page walked client-side (fiche 01 tâche 4,
   * fiche 22 tâche 1: the two features share this one implementation).
   */
  count(): Promise<StatusCounts>
  publish(
    id: string,
    input?: { readonly publishedBy?: string | null },
  ): Promise<ContentEntry<TValues>>
  /**
   * The atomic half of scheduled publication (fiche 28 task 4, ADR-free —
   * additive to contract A, no shape changed). Publishes the entry only if
   * it is still `status: 'scheduled'` at the moment of the write, in one
   * guarded `UPDATE`; returns `null` — not an error — when it is not (already
   * published by another process, or edited back to `draft` before its hour
   * came). Two processes racing to publish the same entry therefore run the
   * full publish side effects exactly once between them, never twice.
   */
  claimForScheduledPublish(id: string): Promise<ContentEntry<TValues> | null>
  unpublish(
    id: string,
    input?: {
      readonly status?: 'draft' | 'archived' | 'scheduled'
      /**
       * Required, and only meaningful, when `status` is `'scheduled'`: the
       * future instant this entry becomes public. A `Date`, an ISO 8601
       * string, or epoch milliseconds — the same three forms
       * `schedulePublication` accepts, since this is the write that puts an
       * entry into the state that function's caller later queues a job for.
       */
      readonly publishedAt?: Date | string | number
    },
  ): Promise<ContentEntry<TValues>>
  history(id: string, options?: TrashOptions): Promise<readonly VersionSummary[]>
  readVersion(id: string, version: number): Promise<ContentEntry<TValues> | null>
  restore(id: string, version: number, input?: UpdateInput<TValues>): Promise<ContentEntry<TValues>>
  diff(id: string, from: number, to: number): Promise<ContentDiff>
  translations(id: string, options?: TrashOptions): Promise<readonly ContentEntry<TValues>[]>
  /**
   * The working-state translations of every root in `rootIds`, in one query
   * (fiche 10 task 1: a translation dashboard over a thousand entries must
   * not become a thousand `translations()` calls). Rows whose `translationOf`
   * is not among `rootIds` are never returned — this is deliberately not
   * "every family member", only the non-root half of it, since the caller
   * already has the roots from `list({ translationOf: null })`.
   */
  translationsOfMany(
    rootIds: readonly string[],
    options?: TrashOptions,
  ): Promise<readonly ContentEntry<TValues>[]>
  resolveLocale(
    id: string,
    locale: string,
    options: ResolveLocaleOptions,
  ): Promise<LocaleResolution<TValues>>
}

type Row = Record<string, unknown>

interface VersionRow extends Row {
  entry_id: string
  version: number
  status: string
  data: string
  created_at: string
  created_by: string | null
}

interface Snapshot {
  readonly values: Record<string, unknown>
  readonly blocks: BlockZones
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 200
const DEFAULT_SORT: SortOrder = { field: 'id', direction: 'desc' }
/** Enough history to answer "what changed last week" without unbounded growth. */
const DEFAULT_KEEP = 20
const DAY_MS = 24 * 60 * 60 * 1000

const SORT_COLUMNS = { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at' } as const

function notFound(collection: string, id: string): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: `No entry "${id}" in the "${collection}" collection.`,
    hint: 'Check the identifier, and remember that an entry is per locale: a translation has its own id.',
    details: { collection, id },
  })
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

export function createContentStore<TValues extends ContentValues = ContentValues>(
  options: ContentStoreOptions,
): ContentStore<TValues> {
  const { db, collection } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? uuidv7
  const defaultLocale = options.defaultLocale ?? 'en'

  const entries = identifier(entriesTable(collection.name), dialect)
  const versions = identifier(versionsTable(collection.name), dialect)
  const blocks = identifier(blocksTable(collection.name), dialect)

  const relations = relationsOf(collection).filter((relation) => relation.many)
  const columnFields = Object.entries(collection.fields).filter(([, field]) => !isColumnless(field))
  const zoneNames = Object.entries(collection.fields)
    .filter(([, field]) => field.kind === 'blocks')
    .map(([name]) => name)

  const keep = Math.max(
    2,
    collection.versioning?.history === true ? (collection.versioning.keep ?? DEFAULT_KEEP) : 2,
  )
  const draftsEnabled = collection.versioning?.drafts === true

  /** `trash: false` opts back out; absent means the default window is on. */
  const trashEnabled = collection.trash !== false
  const retainDays =
    collection.trash === false || collection.trash === undefined
      ? DEFAULT_TRASH_RETAIN_DAYS
      : collection.trash.retainDays

  const stamp = (): string => now().toISOString()

  // -------------------------------------------------------------- the trash

  const deletedAt = identifier('deleted_at', dialect)

  /**
   * The one place the trash filter is spelled out.
   *
   * Returning `null` for `'include'` rather than a `1 = 1` fragment keeps the
   * generated SQL identical to what it was before 2.0 whenever the caller
   * wanted everything — nothing to explain in a query plan.
   */
  function trashPredicate(filter: TrashFilter | undefined): SqlFragment | null {
    const effective = filter ?? 'exclude'
    if (effective === 'include') return null
    return effective === 'only' ? sql`${deletedAt} is not null` : sql`${deletedAt} is null`
  }

  function isTrashed(row: Row): boolean {
    return row['deleted_at'] !== null && row['deleted_at'] !== undefined
  }

  /** True when this row is invisible to a caller asking for `filter`. */
  function hiddenBy(row: Row, filter: TrashFilter | undefined): boolean {
    const effective = filter ?? 'exclude'
    if (effective === 'include') return false
    return effective === 'only' ? !isTrashed(row) : isTrashed(row)
  }

  /**
   * Every `restrict` relation pointing at this collection, from any collection
   * the store was told about — including this one, whose self-references it
   * would otherwise miss.
   */
  const restrictingRelations = (options.siblings ?? [collection]).flatMap((sibling) =>
    relationsOf(sibling)
      .filter(
        (relation) =>
          relation.kind === 'relation' &&
          relation.to === collection.name &&
          relation.onDelete === 'restrict',
      )
      .map((relation) => ({ sibling, relation })),
  )

  /**
   * Refuses to remove an entry that something still points at.
   *
   * Before 2.0 the foreign key did this, and only ever at `DELETE` time.
   * Trashing is an `UPDATE`, so the database has nothing to refuse — which is
   * precisely why contract A now requires the check in application code. The
   * message names what blocks, exactly as the contract's own example does.
   *
   * `purge()` runs the same check, so an operator gets the same sentence
   * whichever of the two they reached for, instead of a raw driver error on
   * one path and a written one on the other.
   */
  interface Blocker {
    readonly collection: string
    readonly field: string
    readonly count: number
  }

  async function referencesTo(tx: SqlExecutor, id: string): Promise<Blocker[]> {
    const blocking: Blocker[] = []

    for (const { sibling, relation } of restrictingRelations) {
      const siblingEntries = identifier(entriesTable(sibling.name), dialect)
      const count = relation.many
        ? await countJoinReferences(tx, sibling, relation.field, siblingEntries, id)
        : await countColumnReferences(tx, relation.field, siblingEntries, id)

      if (count > 0) {
        blocking.push({ collection: sibling.name, field: relation.field, count })
      }
    }

    return blocking
  }

  async function isReferenced(tx: SqlExecutor, id: string): Promise<boolean> {
    return (await referencesTo(tx, id)).length > 0
  }

  async function assertNotReferenced(tx: SqlExecutor, id: string): Promise<void> {
    const blocking = await referencesTo(tx, id)
    if (blocking.length === 0) return

    const naming = blocking
      .map(
        ({ count, collection: name }) =>
          `${count} ${count === 1 ? 'entry' : 'entries'} of "${name}"`,
      )
      .join(', ')

    throw new CogentaError({
      code: 'CONTENT_REFERENCED',
      message: `"${id}" cannot be removed from "${collection.name}": ${naming} still reference it.`,
      hint: "Point those entries somewhere else first, or declare the relation with onDelete: 'cascade' if losing them along with their target is really what you want.",
      details: { collection: collection.name, id, blocking },
    })
  }

  /** The real `DELETE`. Cascades take the versions, blocks and join rows. */
  async function hardDelete(tx: SqlExecutor, id: string): Promise<boolean> {
    const removed = await tx.query(
      sql`delete from ${entries} where ${identifier('id', dialect)} = ${id}`,
    )
    return removed.rowsAffected > 0
  }

  async function countColumnReferences(
    tx: SqlExecutor,
    field: string,
    table: SqlFragment,
    id: string,
  ): Promise<number> {
    // A referrer that is itself in the trash does not block: it is not visible
    // content any more, and blocking on it would make the trash a place
    // entries can enter but never leave in the right order.
    const found = await tx.query<Row>(
      sql`select ${identifier('id', dialect)} from ${table}
          where ${identifier(columnFor(field), dialect)} = ${id}
            and ${identifier('deleted_at', dialect)} is null`,
    )
    return found.rows.length
  }

  async function countJoinReferences(
    tx: SqlExecutor,
    sibling: CollectionDefinition,
    field: string,
    siblingEntries: SqlFragment,
    id: string,
  ): Promise<number> {
    const join = identifier(relationTable(sibling.name, field), dialect)
    const found = await tx.query<Row>(
      sql`select ${join}.${identifier('entry_id', dialect)} from ${join}
          join ${siblingEntries}
            on ${siblingEntries}.${identifier('id', dialect)} = ${join}.${identifier('entry_id', dialect)}
          where ${join}.${identifier('target_id', dialect)} = ${id}
            and ${siblingEntries}.${identifier('deleted_at', dialect)} is null`,
    )
    return found.rows.length
  }

  // ---------------------------------------------------------------- reading

  async function loadRow(tx: SqlExecutor, id: string): Promise<Row | null> {
    const found = await tx.query<Row>(
      sql`select * from ${entries} where ${identifier('id', dialect)} = ${id}`,
    )
    return found.rows[0] ?? null
  }

  function valuesFromRow(row: Row): Record<string, unknown> {
    const values: Record<string, unknown> = {}
    for (const [name, field] of columnFields) {
      values[name] = decodeFieldValue(field, row[columnFor(name)])
    }
    return values
  }

  async function loadRelations(
    tx: SqlExecutor,
    entryIds: readonly string[],
  ): Promise<Map<string, Record<string, string[]>>> {
    const byEntry = new Map<string, Record<string, string[]>>()
    for (const id of entryIds) byEntry.set(id, {})
    if (entryIds.length === 0 || relations.length === 0) return byEntry

    for (const relation of relations) {
      const table = identifier(relationTable(collection.name, relation.field), dialect)
      const found = await tx.query<{ entry_id: string; target_id: string }>(
        sql`select ${identifier('entry_id', dialect)}, ${identifier('target_id', dialect)}
            from ${table}
            where ${identifier('entry_id', dialect)} in (${valueList([...entryIds])})
            order by ${identifier('position', dialect)} asc`,
      )

      for (const row of found.rows) {
        const bucket = byEntry.get(text(row.entry_id))
        if (bucket === undefined) continue
        const targets = bucket[relation.field] ?? []
        targets.push(text(row.target_id))
        bucket[relation.field] = targets
      }
    }

    for (const bucket of byEntry.values()) {
      for (const relation of relations) bucket[relation.field] ??= []
    }
    return byEntry
  }

  async function loadBlocks(
    tx: SqlExecutor,
    pairs: readonly (readonly [string, number])[],
  ): Promise<Map<string, BlockZones>> {
    const byEntry = new Map<string, BlockZones>()
    for (const [id] of pairs) byEntry.set(id, emptyZones())
    if (pairs.length === 0 || zoneNames.length === 0) return byEntry

    // One statement for the whole page: a block zone per entry would be the N+1
    // the L1 spec warns about, and a list of ten entries is the common case.
    const predicate = joinFragments(
      pairs.map(
        ([id, version]) =>
          sql`(${identifier('entry_id', dialect)} = ${id} and ${identifier('version', dialect)} = ${version})`,
      ),
      ' or ',
    )

    const found = await tx.query<{
      entry_id: string
      zone: string
      block_key: string
      block_type: string
      data: string
    }>(
      sql`select ${identifier('entry_id', dialect)}, ${identifier('zone', dialect)},
                 ${identifier('block_key', dialect)}, ${identifier('block_type', dialect)},
                 ${identifier('data', dialect)}
          from ${blocks}
          where ${predicate}
          order by ${identifier('zone', dialect)} asc, ${identifier('position', dialect)} asc`,
    )

    const collected = new Map<string, Record<string, ContentBlock[]>>()
    for (const row of found.rows) {
      const entryId = text(row.entry_id)
      const zones = collected.get(entryId) ?? {}
      collected.set(entryId, zones)

      const zone = text(row.zone)
      const list = zones[zone] ?? []
      list.push({
        key: text(row.block_key),
        type: text(row.block_type),
        data: parseObject(row.data),
      })
      zones[zone] = list
    }

    for (const [id, zones] of collected) byEntry.set(id, { ...emptyZones(), ...zones })
    return byEntry
  }

  function emptyZones(): Record<string, readonly ContentBlock[]> {
    return Object.fromEntries(zoneNames.map((zone) => [zone, []]))
  }

  /** Only the four keys contract A declares; anything else is dropped, not trusted. */
  function parseProvenanceDetail(raw: unknown): ContentEntry['provenanceDetail'] {
    if (raw === null || raw === undefined) return null
    const parsed = parseObject(raw)
    const detail: { agent?: string; model?: string; at?: string; prompt?: string } = {}

    for (const key of ['agent', 'model', 'at', 'prompt'] as const) {
      const value = parsed[key]
      if (typeof value === 'string') detail[key] = value
    }

    return Object.keys(detail).length === 0 ? null : detail
  }

  function parseObject(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string') return {}
    try {
      const parsed: unknown = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  /** The three forms `schedulePublication` accepts, turned into the ISO string `publishedAt` is stored as. */
  function scheduleDateIso(value: Date | string | number, entryId: string): string {
    const milliseconds =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'number'
          ? value
          : Date.parse(value)
    if (!Number.isFinite(milliseconds)) {
      throw new CogentaError({
        code: 'CONTENT_SCHEDULE_INVALID',
        message: `"${String(value)}" is not a date to schedule "${entryId}" for.`,
        hint: 'Pass a Date, an ISO 8601 timestamp such as 2026-09-01T09:00:00Z, or epoch milliseconds.',
        details: { collection: collection.name, entryId },
      })
    }
    return new Date(milliseconds).toISOString()
  }

  function publishedAtOf(values: Record<string, unknown>, status: string): string | null {
    // Contract A declares `publishedAt` as an ordinary field of the collection
    // (see its own example), so the engine maintains it when it is there rather
    // than shadowing it with a system column of the same name.
    const declared = collection.fields['publishedAt']
    if (declared === undefined) return null
    const value = values['publishedAt']
    if (typeof value !== 'string') return null
    return status === 'published' || value !== '' ? value : null
  }

  function toEntry(
    row: Row,
    values: Record<string, unknown>,
    zones: BlockZones,
    state: EntryState,
    overrides: { readonly version?: number; readonly status?: string } = {},
  ): ContentEntry<TValues> {
    const status = (overrides.status ?? text(row['status'])) as ContentStatus
    return {
      id: text(row['id']),
      createdAt: text(row['created_at']),
      updatedAt: text(row['updated_at']),
      createdBy: nullableText(row['created_by']),
      updatedBy: nullableText(row['updated_by']),
      status,
      deletedAt: nullableText(row['deleted_at']),
      locale: text(row['locale']),
      translationOf: nullableText(row['translation_of']),
      version: Number(overrides.version ?? row['version']),
      provenance: text(row['provenance']) as Provenance,
      provenanceDetail: parseProvenanceDetail(row['provenance_detail']),
      publishedAt: publishedAtOf(values, status),
      state,
      values: values as TValues,
      blocks: zones,
    }
  }

  /**
   * The live state of a whole page, in a fixed number of queries.
   *
   * One query per row for its blocks and its relations is the N+1 the L1 spec
   * names; a page of twenty entries would be sixty round trips. Batching here
   * means every caller gets it, including the ones written later.
   */
  async function liveEntries(
    tx: SqlExecutor,
    rows: readonly Row[],
  ): Promise<ContentEntry<TValues>[]> {
    if (rows.length === 0) return []

    const ids = rows.map((row) => text(row['id']))
    const related = await loadRelations(tx, ids)
    const zones = await loadBlocks(
      tx,
      rows.map((row) => [text(row['id']), Number(row['version'])] as const),
    )

    return rows.map((row) => {
      const id = text(row['id'])
      const values = { ...valuesFromRow(row), ...(related.get(id) ?? {}) }
      return toEntry(row, values, zones.get(id) ?? emptyZones(), 'published')
    })
  }

  async function liveEntry(tx: SqlExecutor, row: Row): Promise<ContentEntry<TValues>> {
    const [entry] = await liveEntries(tx, [row])
    if (entry === undefined) throw notFound(collection.name, text(row['id']))
    return entry
  }

  async function latestVersionRow(tx: SqlExecutor, id: string): Promise<VersionRow | null> {
    const found = await tx.query<VersionRow>(
      sql`select * from ${versions}
          where ${identifier('entry_id', dialect)} = ${id}
          order by ${identifier('version', dialect)} desc
          limit ${sqlLimit(1)}`,
    )
    return found.rows[0] ?? null
  }

  async function versionRow(
    tx: SqlExecutor,
    id: string,
    version: number,
  ): Promise<VersionRow | null> {
    const found = await tx.query<VersionRow>(
      sql`select * from ${versions}
          where ${identifier('entry_id', dialect)} = ${id}
            and ${identifier('version', dialect)} = ${version}`,
    )
    return found.rows[0] ?? null
  }

  async function snapshotOf(tx: SqlExecutor, id: string, row: VersionRow): Promise<Snapshot> {
    const zones = await loadBlocks(tx, [[id, Number(row.version)]])
    return {
      values: parseObject(row.data),
      blocks: zones.get(id) ?? emptyZones(),
    }
  }

  /**
   * The working state: the newest version when it is ahead of the live row,
   * the live row otherwise.
   */
  async function workingEntry(tx: SqlExecutor, row: Row): Promise<ContentEntry<TValues>> {
    const id = text(row['id'])
    const latest = await latestVersionRow(tx, id)

    if (latest === null || Number(latest.version) <= Number(row['version'])) {
      const live = await liveEntry(tx, row)
      return { ...live, state: 'working' }
    }

    const snapshot = await snapshotOf(tx, id, latest)
    return toEntry(row, snapshot.values, snapshot.blocks, 'working', {
      version: Number(latest.version),
      status: text(latest.status),
    })
  }

  // ---------------------------------------------------------------- writing

  async function writeBlocks(
    tx: SqlExecutor,
    entryId: string,
    version: number,
    zones: Record<string, readonly ContentBlock[]>,
  ): Promise<void> {
    await tx.query(
      sql`delete from ${blocks}
          where ${identifier('entry_id', dialect)} = ${entryId}
            and ${identifier('version', dialect)} = ${version}`,
    )

    for (const [zone, list] of Object.entries(zones)) {
      for (const [position, block] of list.entries()) {
        await tx.query(
          sql`insert into ${blocks} (${identifier('id', dialect)}, ${identifier('entry_id', dialect)},
                ${identifier('version', dialect)}, ${identifier('zone', dialect)},
                ${identifier('position', dialect)}, ${identifier('block_key', dialect)},
                ${identifier('block_type', dialect)}, ${identifier('data', dialect)})
              values (${newId()}, ${entryId}, ${version}, ${zone}, ${position},
                      ${block.key}, ${block.type}, ${JSON.stringify(block.data)})`,
        )
      }
    }
  }

  async function writeRelations(
    tx: SqlExecutor,
    entryId: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    for (const relation of relations) {
      const table = identifier(relationTable(collection.name, relation.field), dialect)
      const targets = values[relation.field]
      if (!Array.isArray(targets)) continue

      await tx.query(
        sql`delete from ${table} where ${identifier('entry_id', dialect)} = ${entryId}`,
      )
      for (const [position, target] of targets.entries()) {
        await tx.query(
          sql`insert into ${table} (${identifier('entry_id', dialect)},
                ${identifier('target_id', dialect)}, ${identifier('position', dialect)})
              values (${entryId}, ${text(target)}, ${position})`,
        )
      }
    }
  }

  async function writeVersion(
    tx: SqlExecutor,
    entryId: string,
    version: number,
    status: string,
    values: Record<string, unknown>,
    author: string | null,
  ): Promise<void> {
    await tx.query(
      sql`delete from ${versions}
          where ${identifier('entry_id', dialect)} = ${entryId}
            and ${identifier('version', dialect)} = ${version}`,
    )
    await tx.query(
      sql`insert into ${versions} (${identifier('id', dialect)}, ${identifier('entry_id', dialect)},
            ${identifier('version', dialect)}, ${identifier('status', dialect)},
            ${identifier('data', dialect)}, ${identifier('created_at', dialect)},
            ${identifier('created_by', dialect)})
          values (${newId()}, ${entryId}, ${version}, ${status},
                  ${JSON.stringify(values)}, ${stamp()}, ${author})`,
    )
  }

  /** Keeps the newest `keep` versions, and never the live one. */
  async function prune(tx: SqlExecutor, entryId: string, liveVersion: number): Promise<void> {
    const found = await tx.query<{ version: number }>(
      sql`select ${identifier('version', dialect)} from ${versions}
          where ${identifier('entry_id', dialect)} = ${entryId}
          order by ${identifier('version', dialect)} desc`,
    )

    const doomed = found.rows
      .map((row) => Number(row.version))
      .slice(keep)
      .filter((version) => version !== liveVersion)

    if (doomed.length === 0) return

    const list = valueList(doomed)
    await tx.query(
      sql`delete from ${versions}
          where ${identifier('entry_id', dialect)} = ${entryId}
            and ${identifier('version', dialect)} in (${list})`,
    )
    await tx.query(
      sql`delete from ${blocks}
          where ${identifier('entry_id', dialect)} = ${entryId}
            and ${identifier('version', dialect)} in (${list})`,
    )
  }

  /**
   * `guard` narrows the `WHERE` beyond `id = ?` — the atomic claim
   * `claimForScheduledPublish` needs. Returns rows affected so a caller can
   * tell a guarded write that changed nothing from one that changed a row:
   * the difference between "I published it" and "someone else already did".
   */
  async function writeLiveColumns(
    tx: SqlExecutor,
    id: string,
    columns: Record<string, unknown>,
    system: Record<string, unknown>,
    guard?: SqlFragment,
  ): Promise<number> {
    const assignments: SqlFragment[] = []

    for (const [name, value] of Object.entries(system)) {
      assignments.push(sql`${identifier(name, dialect)} = ${value}`)
    }
    for (const [name, value] of Object.entries(columns)) {
      assignments.push(sql`${identifier(columnFor(name), dialect)} = ${value}`)
    }

    const where =
      guard === undefined
        ? sql`where ${identifier('id', dialect)} = ${id}`
        : sql`where ${identifier('id', dialect)} = ${id} and ${guard}`

    const result = await tx.query(
      sql`update ${entries} set ${joinFragments(assignments, ', ')} ${where}`,
    )
    return result.rowsAffected
  }

  interface PublishTxOptions {
    readonly publishedBy?: string | null
    /**
     * When set, the write only takes effect if the row's current `status`
     * still equals this value — the atomic claim scheduled publication
     * needs. `null` is returned, not thrown, when the guard does not match:
     * that is "someone else already handled it", not a failure.
     */
    readonly requireStatus?: ContentStatus
  }

  /** Shared by `publish()` and `claimForScheduledPublish()` — see each call site for what `requireStatus` buys. */
  async function publishTx(
    tx: SqlExecutor,
    id: string,
    options: PublishTxOptions,
  ): Promise<ContentEntry<TValues> | null> {
    const row = await loadRow(tx, id)
    if (row === null) return null
    if (options.requireStatus !== undefined && text(row['status']) !== options.requireStatus) {
      return null
    }

    const working = await workingEntry(tx, row)
    const at = stamp()
    const author = options.publishedBy ?? nullableText(row['updated_by'])

    const values: Record<string, unknown> = { ...working.values }
    if (collection.fields['publishedAt'] !== undefined && values['publishedAt'] == null) {
      values['publishedAt'] = at
    }

    // Publication is the moment `required` starts to mean something: a
    // half-written draft can be saved, but it cannot go out.
    const normalised = normaliseValues(collection, values, {
      partial: false,
      enforceRequired: true,
    })

    const guard =
      options.requireStatus === undefined
        ? undefined
        : sql`${identifier('status', dialect)} = ${options.requireStatus}`

    const affected = await writeLiveColumns(
      tx,
      id,
      normalised.columns,
      {
        status: 'published' satisfies ContentStatus,
        version: working.version,
        updated_at: at,
        updated_by: author,
      },
      guard,
    )
    if (guard !== undefined && affected === 0) return null

    await writeRelations(tx, id, normalised.relations)
    // The version row is updated rather than rewritten: its `created_at`
    // is when the draft was written, and publication must not erase it.
    await tx.query(
      sql`update ${versions}
          set ${identifier('status', dialect)} = ${'published'},
              ${identifier('data', dialect)} = ${JSON.stringify({
                ...normalised.values,
                ...normalised.relations,
              })}
          where ${identifier('entry_id', dialect)} = ${id}
            and ${identifier('version', dialect)} = ${working.version}`,
    )
    await prune(tx, id, working.version)

    const after = await loadRow(tx, id)
    if (after === null) return null
    return liveEntry(tx, after)
  }

  // ------------------------------------------------------------ pagination

  function sortOrder(options: ListOptions): SortOrder {
    return options.sort ?? DEFAULT_SORT
  }

  function keysetPredicate(cursor: Cursor): SqlFragment {
    const column = identifier(SORT_COLUMNS[cursor.field], dialect)
    const id = identifier('id', dialect)
    const comparison = cursor.direction === 'asc' ? '>' : '<'

    // Strictly after the last row handed out, in the same order. A row inserted
    // concurrently is either before that point — and was already returned — or
    // after it, and comes on a later page. Nothing shifts, which an offset
    // cannot promise.
    if (cursor.field === 'id') {
      return sql`${id} ${rawOperator(comparison)} ${cursor.id}`
    }
    return sql`(${column} ${rawOperator(comparison)} ${cursor.value}
                or (${column} = ${cursor.value} and ${id} ${rawOperator(comparison)} ${cursor.id}))`
  }

  function rawOperator(comparison: '<' | '>'): SqlFragment {
    // The operator comes from a closed set in this file, never from a caller.
    return comparison === '<' ? sql`<` : sql`>`
  }

  function orderClause(order: SortOrder): SqlFragment {
    const direction = order.direction === 'asc' ? sql`asc` : sql`desc`
    const column = identifier(SORT_COLUMNS[order.field], dialect)
    // The id is always the tie-breaker: two rows created in the same
    // millisecond must still have one stable order, or a cursor could skip one.
    return sql`${column} ${direction}, ${identifier('id', dialect)} ${direction}`
  }

  function cursorFor(entry: ContentEntry<TValues>, order: SortOrder): string {
    const value =
      order.field === 'id'
        ? entry.id
        : order.field === 'createdAt'
          ? entry.createdAt
          : entry.updatedAt
    return encodeCursor({ field: order.field, direction: order.direction, value, id: entry.id })
  }

  // ------------------------------------------------------------------- API

  /**
   * The whole of `create`, minus the transaction.
   *
   * Split out so `duplicate` can read the source and write the copy inside a
   * single transaction: the free-slug probe it does between the two would
   * otherwise be a read outside the write's transaction, and a concurrent
   * insert could take the slug it had just found free.
   */
  async function insertEntry(
    tx: SqlExecutor,
    input: CreateInput<TValues>,
  ): Promise<ContentEntry<TValues>> {
    const id = input.id ?? newId()
    const status = input.status ?? 'draft'
    const at = stamp()
    const author = input.createdBy ?? null

    const normalised = normaliseValues(collection, input.values ?? {}, {
      partial: false,
      enforceRequired: status === 'published',
    })
    const zones = normaliseBlocks(collection, input.blocks ?? {}, newId)
    const values = { ...normalised.values }

    if (status === 'published' && collection.fields['publishedAt'] !== undefined) {
      values['publishedAt'] ??= at
      normalised.columns['publishedAt'] ??= at
    }

    const columns = [
      'id',
      'created_at',
      'updated_at',
      'created_by',
      'updated_by',
      'status',
      'locale',
      'translation_of',
      'version',
      'provenance',
      'provenance_detail',
    ]
    const bound: unknown[] = [
      id,
      at,
      at,
      author,
      author,
      status,
      input.locale ?? defaultLocale,
      input.translationOf ?? null,
      1,
      input.provenance ?? ('human' satisfies Provenance),
      input.provenanceDetail === undefined || input.provenanceDetail === null
        ? null
        : JSON.stringify(input.provenanceDetail),
    ]

    for (const [name, value] of Object.entries(normalised.columns)) {
      columns.push(columnFor(name))
      bound.push(value)
    }

    await tx.query(
      sql`insert into ${entries} (${joinFragments(
        columns.map((column) => identifier(column, dialect)),
        ', ',
      )}) values (${valueList(bound)})`,
    )

    await writeRelations(tx, id, normalised.relations)
    await writeBlocks(tx, id, 1, zones)
    await writeVersion(tx, id, 1, status, { ...values, ...normalised.relations }, author)

    const row = await loadRow(tx, id)
    if (row === null) throw notFound(collection.name, id)
    return liveEntry(tx, row)
  }

  // ------------------------------------------------------------ duplication

  const uniqueFields = Object.entries(collection.fields).filter(
    ([, field]) => field.unique === true && !isColumnless(field),
  )

  async function isTaken(
    tx: SqlExecutor,
    field: string,
    locale: string,
    candidate: string,
  ): Promise<boolean> {
    // Uniqueness is per locale, exactly as the index in `tables.ts` declares
    // it: the same slug in French and in English is the normal case.
    const found = await tx.query<Row>(
      sql`select ${identifier('id', dialect)} from ${entries}
          where ${identifier('locale', dialect)} = ${locale}
            and ${identifier(columnFor(field), dialect)} = ${candidate}
          limit ${sqlLimit(1)}`,
    )
    return found.rows.length > 0
  }

  /**
   * A value for a `unique` field that no row holds yet, derived from the one
   * being copied: `hello` becomes `hello-copy`, then `hello-copy-2`.
   *
   * The unique index stays the enforcement point — this only spares the caller
   * a raw constraint violation on the single most common shape there is (an
   * article with a unique slug).
   */
  async function freeUniqueValue(
    tx: SqlExecutor,
    field: string,
    locale: string,
    source: string,
  ): Promise<string> {
    for (let attempt = 1; attempt <= 1000; attempt++) {
      const candidate = attempt === 1 ? `${source}-copy` : `${source}-copy-${attempt}`
      if (!(await isTaken(tx, field, locale, candidate))) return candidate
    }
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `Could not derive a free value for the unique field "${field}".`,
      hint: 'A thousand copies of this value already exist. Pass an explicit value for the field instead.',
      details: { collection: collection.name, field },
    })
  }

  return {
    create: async (input) => db.transaction((tx) => insertEntry(tx, input), { immediate: true }),

    /**
     * Copies one entry into a new draft.
     *
     * Three decisions are worth stating, because each could reasonably have
     * gone the other way:
     *
     * 1. **The copy starts its own translation family** — `translationOf` is
     *    always null, even when the source is itself a translation. Two rows
     *    of the same family sharing a locale would make `resolveLocale` pick
     *    between them arbitrarily (it takes the first match) and would show
     *    the copy in `translations()` as if it were another language. A copy
     *    is a new piece of content, not a new language of an old one.
     * 2. **Blocks get fresh keys.** A `_key` anchors comments and RAG chunks;
     *    the same key living in two entries would make "which entry does this
     *    block belong to" answerable only with the entry id alongside it.
     * 3. **Provenance is carried over, not reset to `human`.** Copying
     *    generated content does not make it human-written, and pressing
     *    duplicate must not launder it. Pass `provenance` to override.
     *
     * The copy is always a `draft`, its version count restarts at 1 and it
     * inherits none of the source's history — the source's past is the
     * source's.
     */
    duplicate: async (id, duplicateOptions) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) throw notFound(collection.name, id)

          // The working state, not the published one: the admin's duplicate
          // button copies what the editor is looking at.
          const source = await workingEntry(tx, row)
          const overrides = duplicateOptions?.values ?? {}
          const locale = source.locale
          const values: Record<string, unknown> = { ...source.values }

          // Never carried over: a copy has never been published.
          if (collection.fields['publishedAt'] !== undefined) values['publishedAt'] = null

          for (const [field] of uniqueFields) {
            if (Object.hasOwn(overrides, field)) continue
            const current = values[field]
            if (current === null || current === undefined || current === '') continue
            if (typeof current !== 'string') {
              throw new CogentaError({
                code: 'CONTENT_INVALID',
                message: `"${field}" is unique and is not text, so a copy of it cannot be derived.`,
                hint: 'Pass a value for the field in duplicate()’s values, so the copy has its own.',
                details: { collection: collection.name, field },
              })
            }
            values[field] = await freeUniqueValue(tx, field, locale, current)
          }

          const blocks: Record<string, readonly ContentBlock[]> = {}
          for (const [zone, list] of Object.entries(source.blocks)) {
            blocks[zone] = list.map((block) => ({ ...block, key: '' }))
          }

          return insertEntry(tx, {
            ...(duplicateOptions?.id === undefined ? {} : { id: duplicateOptions.id }),
            locale,
            translationOf: null,
            status: 'draft',
            createdBy: duplicateOptions?.createdBy ?? null,
            provenance: duplicateOptions?.provenance ?? source.provenance,
            provenanceDetail: duplicateOptions?.provenanceDetail ?? source.provenanceDetail,
            values: { ...values, ...overrides } as Partial<TValues>,
            blocks,
          })
        },
        { immediate: true },
      ),

    read: async (id, readOptions) => {
      const state = readOptions?.state ?? 'published'
      const row = await loadRow(db, id)
      if (row === null) return null
      // The trash is invisible unless it is asked for by name (ADR-0022) —
      // the same safe-by-default posture as `state` on the line below.
      if (hiddenBy(row, readOptions?.trashed)) return null

      // The safe default: a caller that says nothing gets the published state,
      // never a draft. The public role has no way to ask for one.
      if (state === 'published') {
        return text(row['status']) === 'published' ? liveEntry(db, row) : null
      }
      return workingEntry(db, row)
    },

    update: async (id, input) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) throw notFound(collection.name, id)

          // Detection, not locking (fiche 02 task 7): compared with the exact
          // same `text(row['updated_at'])` a caller's own `read()` handed back
          // as `Entry.updatedAt` (line ~533 below), so two requests that loaded
          // the same row compare equal, and a write that landed in between
          // does not.
          if (
            input.expectedUpdatedAt !== undefined &&
            input.expectedUpdatedAt !== text(row['updated_at'])
          ) {
            throw new CogentaError({
              code: 'CONTENT_STALE_WRITE',
              message: `"${id}" was changed by someone else since this write was loaded.`,
              hint: 'Reload the entry, compare what changed, and reapply your edit.',
              details: {
                collection: collection.name,
                id,
                expected: input.expectedUpdatedAt,
                actual: text(row['updated_at']),
              },
            })
          }

          const working = await workingEntry(tx, row)
          const next = working.version + 1
          const author = input.updatedBy ?? nullableText(row['updated_by'])

          const merged = { ...working.values, ...(input.values ?? {}) }
          const normalised = normaliseValues(collection, merged, {
            partial: false,
            enforceRequired: false,
          })
          const zones = normaliseBlocks(
            collection,
            { ...working.blocks, ...(input.blocks ?? {}) },
            newId,
          )
          const snapshot = { ...normalised.values, ...normalised.relations }

          await writeBlocks(tx, id, next, zones)
          await writeVersion(tx, id, next, 'draft', snapshot, author)

          // With drafts on, editing a published entry must not touch what the
          // public sees: the change lands as a version and waits for publish().
          const overlayOnly = draftsEnabled && text(row['status']) === 'published'

          if (!overlayOnly) {
            const system: Record<string, unknown> = {
              updated_at: stamp(),
              updated_by: author,
              version: next,
            }
            if (input.provenance !== undefined) system['provenance'] = input.provenance
            if (input.provenanceDetail !== undefined) {
              system['provenance_detail'] =
                input.provenanceDetail === null ? null : JSON.stringify(input.provenanceDetail)
            }

            await writeLiveColumns(tx, id, normalised.columns, system)
            await writeRelations(tx, id, normalised.relations)
          }

          const after = await loadRow(tx, id)
          if (after === null) throw notFound(collection.name, id)
          await prune(tx, id, Number(after['version']))

          return workingEntry(tx, after)
        },
        { immediate: true },
      ),

    delete: async (id) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) return false
          // Already in the trash: nothing to do, and saying so with `false`
          // matches what the method meant before 2.0 for a missing row.
          if (isTrashed(row)) return false

          await assertNotReferenced(tx, id)
          if (!trashEnabled) return hardDelete(tx, id)

          const removed = await tx.query(
            sql`update ${entries} set ${deletedAt} = ${stamp()}
                where ${identifier('id', dialect)} = ${id}`,
          )
          return removed.rowsAffected > 0
        },
        { immediate: true },
      ),

    untrash: async (id) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) throw notFound(collection.name, id)

          if (!isTrashed(row)) {
            throw new CogentaError({
              code: 'CONTENT_NOT_TRASHED',
              message: `"${id}" is not in the "${collection.name}" trash.`,
              hint: 'Only an entry that was trashed can be taken back out. Nothing was changed.',
              details: { collection: collection.name, id },
            })
          }

          // `status` is deliberately untouched: an article that was published
          // when it was trashed comes back published (ADR-0022). Restoring it
          // as a draft would lose information and invite a second, accidental
          // publication.
          await tx.query(
            sql`update ${entries} set ${deletedAt} = ${null}
                where ${identifier('id', dialect)} = ${id}`,
          )

          const after = await loadRow(tx, id)
          if (after === null) throw notFound(collection.name, id)
          return { ...(await liveEntry(tx, after)), state: 'working' as const }
        },
        { immediate: true },
      ),

    purge: async (id) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) return false
          await assertNotReferenced(tx, id)
          return hardDelete(tx, id)
        },
        { immediate: true },
      ),

    purgeExpired: async () => {
      const olderThan = new Date(now().getTime() - retainDays * DAY_MS).toISOString()
      if (!trashEnabled) return { purged: 0, olderThan }

      return db.transaction(
        async (tx) => {
          const expired = await tx.query<Row>(
            sql`select ${identifier('id', dialect)} from ${entries}
                where ${deletedAt} is not null and ${deletedAt} < ${olderThan}`,
          )

          let purged = 0
          for (const row of expired.rows) {
            const id = text(row['id'])
            // Each one is still checked — a sweep that quietly broke a
            // `restrict` relation would be the hole the trash exists to close
            // — but one blocked entry is **skipped**, not fatal: a scheduled
            // sweep that dies on the first stuck row purges nothing ever
            // again, and nobody would notice.
            if (await isReferenced(tx, id)) continue
            if (await hardDelete(tx, id)) purged += 1
          }

          return { purged, olderThan }
        },
        { immediate: true },
      )
    },

    list: async (listOptions = {}) => {
      const order = sortOrder(listOptions)
      const state = listOptions.state ?? 'published'
      const size = Math.min(Math.max(listOptions.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

      const predicates: SqlFragment[] = []

      const trash = trashPredicate(listOptions.trashed)
      if (trash !== null) predicates.push(trash)

      if (listOptions.status !== undefined) {
        predicates.push(sql`${identifier('status', dialect)} = ${listOptions.status}`)
      } else if (state === 'published') {
        predicates.push(sql`${identifier('status', dialect)} = ${'published'}`)
      }

      if (listOptions.locale !== undefined) {
        predicates.push(sql`${identifier('locale', dialect)} = ${listOptions.locale}`)
      }

      if (listOptions.translationOf !== undefined) {
        predicates.push(
          listOptions.translationOf === null
            ? sql`${identifier('translation_of', dialect)} is null`
            : sql`${identifier('translation_of', dialect)} = ${listOptions.translationOf}`,
        )
      }

      for (const [field, value] of Object.entries(listOptions.where ?? {})) {
        const definition = collection.fields[field]
        if (definition === undefined || isColumnless(definition)) {
          throw new CogentaError({
            code: 'CONTENT_INVALID',
            message: `Cannot filter "${collection.name}" on "${field}".`,
            hint: 'Filters apply to declared fields that have a column: not to block zones or to-many relations.',
            details: { collection: collection.name, field },
          })
        }
        predicates.push(
          value === null
            ? sql`${identifier(columnFor(field), dialect)} is null`
            : sql`${identifier(columnFor(field), dialect)} = ${value}`,
        )
      }

      if (listOptions.cursor !== undefined) {
        predicates.push(keysetPredicate(decodeCursor(listOptions.cursor, order)))
      }

      const where =
        predicates.length === 0 ? sql`` : sql` where ${joinFragments(predicates, ' and ')}`

      // One more row than asked for: its existence is the answer to "is there a
      // next page", without a second count query that would race the inserts.
      const found = await db.query<Row>(
        sql`select * from ${entries}${where} order by ${orderClause(order)} limit ${sqlLimit(size + 1)}`,
      )

      const rows = found.rows.slice(0, size)
      let items: ContentEntry<TValues>[]

      if (state === 'published') {
        items = await liveEntries(db, rows)
      } else {
        // The working state of an entry is its newest version row, which cannot
        // be reached in the same pass; the admin list pays for what it asks.
        items = []
        for (const row of rows) items.push(await workingEntry(db, row))
      }

      const last = items.at(-1)
      const hasMore = found.rows.length > size

      return {
        items,
        hasMore,
        nextCursor: hasMore && last !== undefined ? cursorFor(last, order) : null,
      }
    },

    count: async () => {
      const statusColumn = identifier('status', dialect)
      const statusAlias = identifier('status', dialect)
      const countAlias = identifier('n', dialect)

      const grouped = await db.query<{ status: string; n: number | string }>(
        sql`select ${statusColumn} as ${statusAlias}, count(*) as ${countAlias}
            from ${entries}
            where ${deletedAt} is null
            group by ${statusColumn}`,
      )
      const trashedResult = await db.query<{ n: number | string }>(
        sql`select count(*) as ${countAlias} from ${entries} where ${deletedAt} is not null`,
      )

      const byStatus: Record<ContentStatus, number> = {
        draft: 0,
        scheduled: 0,
        published: 0,
        archived: 0,
      }
      let total = 0
      for (const row of grouped.rows) {
        const status = text(row.status) as ContentStatus
        const n = Number(row.n)
        if (status in byStatus) byStatus[status] = n
        total += n
      }

      return {
        ...byStatus,
        trashed: Number(trashedResult.rows[0]?.n ?? 0),
        total,
      }
    },

    publish: async (id, publishOptions) =>
      db.transaction(
        async (tx) => {
          const result = await publishTx(tx, id, {
            ...(publishOptions?.publishedBy === undefined
              ? {}
              : { publishedBy: publishOptions.publishedBy }),
          })
          if (result === null) throw notFound(collection.name, id)
          return result
        },
        { immediate: true },
      ),

    // Fiche 28 task 4's concurrency fix: two processes racing to publish the
    // same scheduled entry (a multi-instance deploy, or the scheduler and a
    // manual "publish now" click landing at once) must not both run the full
    // publish side effects. `publishTx`'s `requireStatus` guard makes the
    // claim atomic — `writeLiveColumns`'s `WHERE status = 'scheduled'` either
    // wins outright or affects zero rows, never both at once, on all three
    // dialects (see the "claiming a scheduled publish" test for the proof: a
    // naive read-then-write reimplementation of this same operation is shown
    // to double-run).
    claimForScheduledPublish: async (id) =>
      db.transaction((tx) => publishTx(tx, id, { requireStatus: 'scheduled' }), {
        immediate: true,
      }),

    unpublish: async (id, unpublishOptions) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) throw notFound(collection.name, id)

          const status = unpublishOptions?.status ?? 'draft'

          if (status === 'scheduled') {
            // Scheduling has nowhere to put the date on a collection that
            // never declared `publishedAt` as a field (contract A: it is an
            // ordinary, optional field, not a system column every collection
            // gets for free).
            if (collection.fields['publishedAt'] === undefined) {
              throw new CogentaError({
                code: 'CONTENT_SCHEDULE_INVALID',
                message: `"${collection.name}" has no "publishedAt" field to schedule a publication against.`,
                hint: 'Declare a `publishedAt` field on this collection before scheduling an entry.',
                details: { collection: collection.name, entryId: id },
              })
            }
            if (unpublishOptions?.publishedAt === undefined) {
              throw new CogentaError({
                code: 'CONTENT_SCHEDULE_INVALID',
                message: 'A scheduled publication needs a date.',
                hint: 'Pass `publishedAt` — a Date, an ISO 8601 timestamp, or epoch milliseconds.',
                details: { collection: collection.name, entryId: id },
              })
            }
            const iso = scheduleDateIso(unpublishOptions.publishedAt, id)
            const working = await workingEntry(tx, row)
            const merged = { ...working.values, publishedAt: iso }
            const normalised = normaliseValues(collection, merged, {
              partial: false,
              enforceRequired: false,
            })
            await writeLiveColumns(tx, id, normalised.columns, { status, updated_at: stamp() })
          } else {
            await writeLiveColumns(tx, id, {}, { status, updated_at: stamp() })
          }

          const after = await loadRow(tx, id)
          if (after === null) throw notFound(collection.name, id)
          return { ...(await liveEntry(tx, after)), state: 'working' as const }
        },
        { immediate: true },
      ),

    history: async (id, historyOptions) => {
      const row = await loadRow(db, id)
      if (row === null) throw notFound(collection.name, id)
      // A trashed entry has no history as far as an ordinary caller is
      // concerned: it does not exist for them, and saying "not found" is the
      // same answer `read()` gives.
      if (hiddenBy(row, historyOptions?.trashed)) throw notFound(collection.name, id)

      const found = await db.query<VersionRow>(
        sql`select * from ${versions}
            where ${identifier('entry_id', dialect)} = ${id}
            order by ${identifier('version', dialect)} desc`,
      )

      const live = Number(row['version'])
      return found.rows.map((version) => ({
        version: Number(version.version),
        status: text(version.status) as ContentStatus,
        createdAt: text(version.created_at),
        createdBy: nullableText(version.created_by),
        live: Number(version.version) === live,
      }))
    },

    readVersion: async (id, version) => {
      const row = await loadRow(db, id)
      if (row === null) return null

      const found = await versionRow(db, id, version)
      if (found === null) return null

      const snapshot = await snapshotOf(db, id, found)
      return toEntry(row, snapshot.values, snapshot.blocks, 'working', {
        version,
        status: text(found.status),
      })
    },

    restore: async (id, version, restoreOptions) =>
      db.transaction(
        async (tx) => {
          const row = await loadRow(tx, id)
          if (row === null) throw notFound(collection.name, id)

          const found = await versionRow(tx, id, version)
          if (found === null) {
            throw new CogentaError({
              code: 'CONTENT_NOT_FOUND',
              message: `Version ${version} of "${id}" is no longer kept.`,
              hint: `This collection keeps ${keep} versions. Older ones are pruned on write.`,
              details: { collection: collection.name, id, version, keep },
            })
          }

          const snapshot = await snapshotOf(tx, id, found)
          const working = await workingEntry(tx, row)
          const next = working.version + 1
          const author = restoreOptions?.updatedBy ?? nullableText(row['updated_by'])

          // Restoring is itself an edit: it creates a new version rather than
          // rewinding the counter, so the history stays append-only and the
          // restore can itself be undone (rule R6).
          const normalised = normaliseValues(collection, snapshot.values, {
            partial: false,
            enforceRequired: false,
          })
          const zones = normaliseBlocks(collection, snapshot.blocks, newId)

          await writeBlocks(tx, id, next, zones)
          await writeVersion(
            tx,
            id,
            next,
            'draft',
            { ...normalised.values, ...normalised.relations },
            author,
          )

          if (!(draftsEnabled && text(row['status']) === 'published')) {
            await writeLiveColumns(tx, id, normalised.columns, {
              updated_at: stamp(),
              updated_by: author,
              version: next,
            })
            await writeRelations(tx, id, normalised.relations)
          }

          const after = await loadRow(tx, id)
          if (after === null) throw notFound(collection.name, id)
          await prune(tx, id, Number(after['version']))
          return workingEntry(tx, after)
        },
        { immediate: true },
      ),

    diff: async (id, from, to) => {
      const row = await loadRow(db, id)
      if (row === null) throw notFound(collection.name, id)

      const load = async (version: number): Promise<Snapshot> => {
        const found = await versionRow(db, id, version)
        if (found === null) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: `Version ${version} of "${id}" is no longer kept.`,
            hint: `This collection keeps ${keep} versions. Compare one that history() still lists.`,
            details: { collection: collection.name, id, version },
          })
        }
        return snapshotOf(db, id, found)
      }

      return diffContent(await load(from), await load(to))
    },

    translations: async (id, translationsOptions) => {
      const row = await loadRow(db, id)
      if (row === null) return []
      if (hiddenBy(row, translationsOptions?.trashed)) return []

      const sourceId = nullableText(row['translation_of']) ?? text(row['id'])
      const found = await db.query<Row>(
        sql`select * from ${entries}
            where ${identifier('id', dialect)} = ${sourceId}
               or ${identifier('translation_of', dialect)} = ${sourceId}
            order by ${identifier('locale', dialect)} asc`,
      )

      // A trashed member of the family is filtered out here rather than in the
      // query, so that the family is still found through *any* of its members
      // — including one whose source is in the trash.
      const visible = found.rows.filter((member) => !hiddenBy(member, translationsOptions?.trashed))
      return liveEntries(db, visible)
    },

    translationsOfMany: async (rootIds, translationsOptions) => {
      if (rootIds.length === 0) return []

      const predicates: SqlFragment[] = [
        sql`${identifier('translation_of', dialect)} in (${valueList([...rootIds])})`,
      ]
      const trash = trashPredicate(translationsOptions?.trashed)
      if (trash !== null) predicates.push(trash)

      const found = await db.query<Row>(
        sql`select * from ${entries} where ${joinFragments(predicates, ' and ')}`,
      )

      // The working state of each row, same as `list({ state: 'working' })`
      // does: it cannot be read in the same pass because the newest version
      // may be ahead of the live row (see that method's own comment).
      const items: ContentEntry<TValues>[] = []
      for (const row of found.rows) items.push(await workingEntry(db, row))
      return items
    },

    resolveLocale: async (id, locale, resolveOptions) => {
      const state = resolveOptions.state ?? 'published'
      const row = await loadRow(db, id)
      if (row === null) return { outcome: 'notFound' }
      if (hiddenBy(row, resolveOptions.trashed)) return { outcome: 'notFound' }

      const sourceId = nullableText(row['translation_of']) ?? text(row['id'])
      const found = await db.query<Row>(
        sql`select * from ${entries}
            where ${identifier('id', dialect)} = ${sourceId}
               or ${identifier('translation_of', dialect)} = ${sourceId}`,
      )

      // Publication is per language (ADR-0014): a French entry can be live while
      // its English translation is still a draft, and the renderer must treat
      // the draft as if it did not exist.
      const visible = found.rows.filter(
        (member) =>
          !hiddenBy(member, resolveOptions.trashed) &&
          (state === 'working' || text(member['status']) === 'published'),
      )

      const match = visible.find((member) => text(member['locale']) === locale)
      if (match !== undefined) {
        const entry =
          state === 'published' ? await liveEntry(db, match) : await workingEntry(db, match)
        return { outcome: 'found', entry, fellBack: false }
      }

      if (resolveOptions.fallback === 'hide') return { outcome: 'hidden' }
      if (resolveOptions.fallback === 'notFound') return { outcome: 'notFound' }

      const original = visible.find((member) => text(member['id']) === sourceId)
      // 'original' cannot invent a source that is itself unpublished; there is
      // nothing to show, so the honest answer is the same as a missing page.
      if (original === undefined) return { outcome: 'notFound' }

      const entry =
        state === 'published' ? await liveEntry(db, original) : await workingEntry(db, original)
      return { outcome: 'found', entry, fellBack: true }
    },
  }
}
