import { createHash, randomUUID } from 'node:crypto'
import { type DatabaseHandle, identifier, type SqlExecutor, sql, unsafeRaw } from '../db/index.js'
import { CogentaError } from '../errors/index.js'
import {
  assertMediaFolderDepth,
  childFolderPath,
  folderDepthOf,
  isWithinFolder,
  MEDIA_FOLDER_PATH_LENGTH,
  rebasedFolderPath,
} from './folder-path.js'
import { MEDIA_TABLE } from './store.js'
import type {
  CreateMediaFolderInput,
  ListMediaFoldersOptions,
  MediaFolder,
  MediaFolderStore,
  UpdateMediaFolderInput,
} from './types.js'

export const MEDIA_FOLDER_TABLE = 'cogenta_media_folders'

export interface DatabaseMediaFolderStoreOptions {
  readonly db: DatabaseHandle
  /** The media table checked for "does this folder still hold assets" on delete. Defaults to `MEDIA_TABLE`. */
  readonly mediaTable?: string
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => Date
  readonly newId?: () => string
}

interface FolderRow {
  id: string
  parent_id: string | null
  name: string
  path: string
  position: number
  created_at: string
}

function rowToFolder(row: FolderRow): MediaFolder {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    path: row.path,
    position: Number(row.position),
    createdAt: row.created_at,
  }
}

function folderNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MEDIA_FOLDER_NOT_FOUND',
    message: `No media folder with id "${id}".`,
    hint: 'List the folder tree to find a valid id, or the folder may already have been deleted.',
    details: { id },
  })
}

function invalidName(): CogentaError {
  return new CogentaError({
    code: 'MEDIA_FOLDER_INVALID',
    message: 'A media folder needs a non-empty name.',
    hint: 'Give the folder a name before creating or renaming it.',
  })
}

/**
 * A stable id for `ensureRoot(name)` — same normalised name, same id, every
 * time, on every replica. That determinism is what lets the `on
 * conflict`/`on duplicate key` upsert in `ensureRoot` resolve two concurrent
 * bootstraps atomically in the database engine itself, rather than this
 * layer having to guess whether a select-then-insert raced. Never used for
 * any other folder — everything else keeps a real random id.
 */
function deterministicRootId(name: string): string {
  const digest = createHash('sha256').update(name.trim().toLowerCase()).digest('hex')
  return `root-${digest.slice(0, 32)}`
}

/** Orders two siblings by `position`, then by `id` only to break an exact tie. */
function siblingCompare(a: FolderRow, b: FolderRow): number {
  const byPosition = Number(a.position) - Number(b.position)
  if (byPosition !== 0) return byPosition
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function groupByParent(rows: readonly FolderRow[]): Map<string | null, FolderRow[]> {
  const byParent = new Map<string | null, FolderRow[]>()
  for (const row of rows) {
    const list = byParent.get(row.parent_id) ?? []
    list.push(row)
    byParent.set(row.parent_id, list)
  }
  for (const list of byParent.values()) list.sort(siblingCompare)
  return byParent
}

/** The whole tree, flattened depth-first from the roots, siblings by `position`. */
function flattenTree(rows: readonly FolderRow[]): FolderRow[] {
  const byParent = groupByParent(rows)
  const ordered: FolderRow[] = []
  const visit = (parent: string | null): void => {
    for (const row of byParent.get(parent) ?? []) {
      ordered.push(row)
      visit(row.id)
    }
  }
  visit(null)
  return ordered
}

/**
 * The persistence layer of the media library's folder tree (fiche 46).
 *
 * Same materialised-path shape as `@cogenta/schema`'s `TaxonomyStore`
 * (ADR-0022): reads are one `like`, writes pay for a move. A folder name is
 * unique among its own siblings (case/whitespace-insensitive) rather than
 * globally — the same rule a real filesystem enforces, and one the tree
 * shape itself (a path is ids, never names) never actually required, so
 * enforcing it is a deliberate UX choice for this fiche, not something the
 * storage model demanded.
 */
export function createDatabaseMediaFolderStore(
  options: DatabaseMediaFolderStoreOptions,
): MediaFolderStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? randomUUID
  const mediaTableName = options.mediaTable ?? MEDIA_TABLE

  const table = identifier(MEDIA_FOLDER_TABLE, dialect)
  const mediaTable = identifier(mediaTableName, dialect)
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return
    await db.query(sql`
      create table if not exists ${table} (
        id varchar(64) not null primary key,
        parent_id varchar(64),
        name varchar(255) not null,
        path varchar(${unsafeRaw(String(MEDIA_FOLDER_PATH_LENGTH))}) not null,
        position integer not null,
        created_at varchar(32) not null
      )`)

    await db
      .query(
        sql`create index ${identifier('cogenta_media_folders_path', dialect)} on ${table} (path)`,
      )
      .catch(() => undefined)
    await db
      .query(
        sql`create index ${identifier('cogenta_media_folders_parent', dialect)}
            on ${table} (parent_id)`,
      )
      .catch(() => undefined)

    ready = true
  }

  async function rowOf(tx: SqlExecutor, id: string): Promise<FolderRow | null> {
    const found = await tx.query<FolderRow>(sql`select * from ${table} where id = ${id}`)
    return found.rows[0] ?? null
  }

  async function siblingsOf(tx: SqlExecutor, parentId: string | null): Promise<FolderRow[]> {
    const found = await tx.query<FolderRow>(
      parentId === null
        ? sql`select * from ${table} where parent_id is null`
        : sql`select * from ${table} where parent_id = ${parentId}`,
    )
    return found.rows
  }

  function normaliseName(name: string): string {
    return name.trim().toLowerCase()
  }

  /**
   * A select-then-check, not a database constraint — a real (if narrow)
   * gap on Postgres/MySQL, unlike `ensureRoot`'s own race. `{ immediate:
   * true }` only serialises two connections on SQLite (a file write lock);
   * Postgres and MySQL both discard it and run under their own default
   * isolation, so two concurrent creates of the same sibling name can both
   * pass this check before either commits. A unique index would need a
   * non-`null` sentinel for the root `parent_id` to be portable across all
   * three dialects (`taxonomy-store.ts` never had this problem — a slug is
   * unique *globally*, not per sibling) — a migration, not a query change.
   * Tracked in `BLOCKERS.md` § fiche 46 rather than fixed here: the worst
   * outcome is a silent duplicate name, never data loss or an escalation.
   */
  async function assertNameFree(
    tx: SqlExecutor,
    parentId: string | null,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const siblings = await siblingsOf(tx, parentId)
    const needle = normaliseName(name)
    const clash = siblings.find((row) => row.id !== exceptId && normaliseName(row.name) === needle)
    if (clash === undefined) return

    throw new CogentaError({
      code: 'MEDIA_FOLDER_NAME_TAKEN',
      message: `A folder named "${name.trim()}" already exists here.`,
      hint: 'Folder names are unique among siblings — rename one of the two, or move this folder elsewhere.',
      details: { parentId, name: name.trim() },
    })
  }

  async function parentPathOf(tx: SqlExecutor, parentId: string | null): Promise<string> {
    if (parentId === null) return ''
    const row = await rowOf(tx, parentId)
    if (row === null) throw folderNotFound(parentId)
    return row.path
  }

  async function nextPosition(tx: SqlExecutor, parentId: string | null): Promise<number> {
    const siblings = await siblingsOf(tx, parentId)
    return siblings.reduce((highest, row) => Math.max(highest, Number(row.position) + 1), 0)
  }

  return {
    create: async (input: CreateMediaFolderInput): Promise<MediaFolder> => {
      await ensureTable()
      const name = input.name.trim()
      if (name.length === 0) throw invalidName()

      return db.transaction(
        async (tx) => {
          const id = input.id ?? newId()
          const parentId = input.parentId ?? null
          const parentPath = await parentPathOf(tx, parentId)
          const path = childFolderPath(parentPath, id)
          assertMediaFolderDepth(path)
          await assertNameFree(tx, parentId, name)

          const position = input.position ?? (await nextPosition(tx, parentId))
          const createdAt = now().toISOString()

          await tx.query(sql`
            insert into ${table} (id, parent_id, name, path, position, created_at)
            values (${id}, ${parentId}, ${name}, ${path}, ${position}, ${createdAt})`)

          const row = await rowOf(tx, id)
          if (row === null) throw folderNotFound(id)
          return rowToFolder(row)
        },
        { immediate: true },
      )
    },

    read: async (id: string): Promise<MediaFolder | null> => {
      await ensureTable()
      const row = await rowOf(db, id)
      return row === null ? null : rowToFolder(row)
    },

    update: async (id: string, input: UpdateMediaFolderInput): Promise<MediaFolder> => {
      await ensureTable()
      return db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) throw folderNotFound(id)

          let name = row.name
          if (input.name !== undefined) {
            name = input.name.trim()
            if (name.length === 0) throw invalidName()
            await assertNameFree(tx, row.parent_id, name, id)
          }
          const position = input.position ?? row.position

          await tx.query(
            sql`update ${table} set name = ${name}, position = ${position} where id = ${id}`,
          )

          const after = await rowOf(tx, id)
          if (after === null) throw folderNotFound(id)
          return rowToFolder(after)
        },
        { immediate: true },
      )
    },

    move: async (id: string, parentId: string | null): Promise<MediaFolder> => {
      await ensureTable()
      return db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) throw folderNotFound(id)

          if (parentId === id) {
            throw new CogentaError({
              code: 'MEDIA_FOLDER_CYCLE',
              message: `A folder cannot be moved into itself.`,
              hint: 'Choose a different destination.',
              details: { id },
            })
          }

          const from = row.path
          const parentPath = await parentPathOf(tx, parentId)

          // A materialised path makes "would this create a cycle" a string
          // test rather than a walk: the impossible move is exactly the one
          // whose new parent already lives inside the subtree being moved —
          // same guard as `TaxonomyStore.move`.
          if (parentId !== null && isWithinFolder(parentPath, from)) {
            throw new CogentaError({
              code: 'MEDIA_FOLDER_CYCLE',
              message: `Moving this folder under "${parentId}" would make it its own ancestor.`,
              hint: 'Move the destination out of this subtree first.',
              details: { id, parentId },
            })
          }

          const to = childFolderPath(parentPath, id)
          if (to === from && parentId === row.parent_id) return rowToFolder(row)

          await assertNameFree(tx, parentId, row.name, id)

          const subtree = await tx.query<FolderRow>(
            sql`select * from ${table} where path like ${`${from}%`}`,
          )
          for (const member of subtree.rows) {
            assertMediaFolderDepth(rebasedFolderPath(member.path, from, to))
          }

          for (const member of subtree.rows) {
            const rebased = rebasedFolderPath(member.path, from, to)
            await tx.query(sql`update ${table} set path = ${rebased} where id = ${member.id}`)
          }

          const position = await nextPosition(tx, parentId)
          await tx.query(
            sql`update ${table} set parent_id = ${parentId}, position = ${position} where id = ${id}`,
          )

          const after = await rowOf(tx, id)
          if (after === null) throw folderNotFound(id)
          return rowToFolder(after)
        },
        { immediate: true },
      )
    },

    delete: async (id: string): Promise<boolean> => {
      await ensureTable()
      return db.transaction(
        async (tx) => {
          const row = await rowOf(tx, id)
          if (row === null) return false

          const children = await tx.query<FolderRow>(
            sql`select id from ${table} where parent_id = ${id}`,
          )
          if (children.rows.length > 0) {
            throw new CogentaError({
              code: 'MEDIA_FOLDER_NOT_EMPTY',
              message: `This folder still has ${children.rows.length} subfolder(s).`,
              hint: 'Move or delete the subfolders first. Nothing was changed.',
              details: { id, subfolders: children.rows.length },
            })
          }

          // Whether any media asset still files under this folder. Wrapped
          // so a media table that has never run `createDatabaseMediaStore`'s
          // own `ensureTable()` (and so has no `folder_id` column yet) reads
          // as "no assets" rather than crashing a folder-only test suite —
          // any real server always constructs both stores together.
          const assetCount = await tx
            .query<{ c: number | string }>(
              sql`select count(*) as c from ${mediaTable} where folder_id = ${id}`,
            )
            .then((result) => Number(result.rows[0]?.c ?? 0))
            .catch(() => 0)

          if (assetCount > 0) {
            throw new CogentaError({
              code: 'MEDIA_FOLDER_NOT_EMPTY',
              message: `This folder still holds ${assetCount} media asset(s).`,
              hint: 'Move or delete the assets first. Nothing was changed.',
              details: { id, assets: assetCount },
            })
          }

          const removed = await tx.query(sql`delete from ${table} where id = ${id}`)
          return removed.rowsAffected > 0
        },
        { immediate: true },
      )
    },

    list: async (listOptions: ListMediaFoldersOptions = {}): Promise<readonly MediaFolder[]> => {
      await ensureTable()
      if (listOptions.parentId !== undefined) {
        const rows = await siblingsOf(db, listOptions.parentId)
        return [...rows].sort(siblingCompare).map(rowToFolder)
      }
      const found = await db.query<FolderRow>(sql`select * from ${table}`)
      return flattenTree(found.rows).map(rowToFolder)
    },

    subtreeIds: async (id: string): Promise<readonly string[]> => {
      await ensureTable()
      const row = await rowOf(db, id)
      if (row === null) throw folderNotFound(id)
      const found = await db.query<FolderRow>(
        sql`select id from ${table} where path like ${`${row.path}%`}`,
      )
      return found.rows.map((member) => member.id)
    },

    // Idempotent bootstrap, called on *every* `cogenta serve` startup — the
    // one case here guaranteed to race for real, not a hypothetical: two
    // replicas starting at once on Postgres or MySQL/MariaDB. `{ immediate:
    // true }` only takes a real write lock on SQLite (`BEGIN IMMEDIATE`);
    // both other drivers discard it and run under their default isolation,
    // so a plain "read the roots, insert if absent" (what this used to do)
    // lets both replicas see no `contents` folder and both insert one — two
    // silent root folders with the same name, no error. Same race, same fix,
    // as `@cogenta/schema`'s `not-found-log.ts`: a deterministic id (so both
    // replicas target the *same* row) plus a real `on conflict`/`on
    // duplicate key` upsert, which every dialect resolves atomically in the
    // engine itself — never a select-then-insert this layer has to guess is
    // safe.
    ensureRoot: async (name: string): Promise<MediaFolder> => {
      await ensureTable()
      const trimmed = name.trim()
      const id = deterministicRootId(trimmed)
      const path = childFolderPath('', id)
      const createdAt = now().toISOString()

      await db.transaction(
        async (tx) => {
          if (dialect === 'mysql') {
            await tx.query(sql`
              insert into ${table} (id, parent_id, name, path, position, created_at)
              values (${id}, ${null}, ${trimmed}, ${path}, 0, ${createdAt})
              on duplicate key update id = id`)
          } else {
            await tx.query(sql`
              insert into ${table} (id, parent_id, name, path, position, created_at)
              values (${id}, ${null}, ${trimmed}, ${path}, 0, ${createdAt})
              on conflict (id) do nothing`)
          }
        },
        { immediate: true },
      )

      const row = await rowOf(db, id)
      if (row === null) throw folderNotFound(id)
      return rowToFolder(row)
    },
  }
}

// Re-exported for callers that only need the depth bound (the admin's own
// validation, for instance) without pulling in the whole path module.
export { folderDepthOf as mediaFolderDepthOf }
