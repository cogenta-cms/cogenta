import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { defineCollection } from '../define-collection.js'
import { defineTaxonomy } from '../define-taxonomy.js'
import type {
  CollectionDefinition,
  CollectionPermissions,
  ContentAction,
  TaxonomyDefinition,
} from '../types.js'
import { booleanValue } from './columns.js'
import { ensureRolePermissionTable, ROLE_PERMISSIONS_TABLE } from './role-permission-tables.js'

/**
 * The database-backed override layer of a role's permissions (fiche 63,
 * ADR-0028).
 *
 * A row here **replaces** a `(targetType, targetName, action)` rule from
 * `cogenta.schema.*` entirely; it never merges with it. `PermissionLayer`
 * (`@cogenta/api`) is the only reader that turns this into an access
 * decision — this store's job stops at persisting a validated row.
 *
 * **Validation reuses `defineCollection`/`defineTaxonomy` — task 4 of the
 * fiche, "ne pas dupliquer une seconde logique de validation."** A candidate
 * write is folded into the real, already-loaded `CollectionDefinition` or
 * `TaxonomyDefinition` (the same objects `PermissionLayer` was built from) in
 * place of the one action being changed, and the result is handed to the
 * same function that validates a collection or taxonomy loaded from the
 * schema file. An invalid role name, an unknown action, or `own` on a
 * taxonomy (which has no author — `defineTaxonomy`'s own `checkPermissions`
 * only accepts a plain role list) is refused by that single door, not a
 * second copy of its rules.
 */

export type RolePermissionTargetType = 'collection' | 'taxonomy'

export interface RolePermissionOverrideRecord {
  readonly targetType: RolePermissionTargetType
  readonly targetName: string
  readonly action: ContentAction
  readonly roles: readonly string[]
  /** Always `false` for a taxonomy target — see the module comment. */
  readonly own: boolean
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface SetRolePermissionInput {
  readonly targetType: RolePermissionTargetType
  readonly targetName: string
  readonly action: ContentAction
  readonly roles: readonly string[]
  readonly own?: boolean
  readonly updatedBy?: string | null
}

export interface RolePermissionStoreOptions {
  readonly db: DatabaseHandle
  /**
   * The file-declared collections/taxonomies to validate an override
   * against — the same arrays `createPermissionLayer` was built from at
   * startup. A target absent from both is `ROLE_PERMISSION_TARGET_UNKNOWN`:
   * an override can narrow or widen an existing collection or taxonomy's
   * rule, never invent a collection that is not declared in code.
   */
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly now?: () => Date
}

export interface RolePermissionStore {
  /** Creates the table if it is missing. Called for you by every other method. */
  ensureTable(): Promise<void>
  list(): Promise<readonly RolePermissionOverrideRecord[]>
  /**
   * Validates the candidate (see the module comment) and writes it,
   * replacing any existing row for the same `(targetType, targetName,
   * action)` triple.
   */
  set(input: SetRolePermissionInput): Promise<RolePermissionOverrideRecord>
  /**
   * Deletes the override, if any — the target's action falls back to
   * `cogenta.schema.*` on the very next check. Returns whether a row existed.
   */
  remove(
    targetType: RolePermissionTargetType,
    targetName: string,
    action: ContentAction,
  ): Promise<boolean>
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function toRecord(row: Row): RolePermissionOverrideRecord {
  return {
    targetType: text(row['target_type']) as RolePermissionTargetType,
    targetName: text(row['target_name']),
    action: text(row['action']) as ContentAction,
    roles: JSON.parse(text(row['roles'])) as readonly string[],
    own: toBool(row['own']),
    updatedAt: text(row['updated_at']),
    updatedBy: nullableText(row['updated_by']),
  }
}

function unknownTarget(targetType: RolePermissionTargetType, targetName: string): CogentaError {
  return new CogentaError({
    code: 'ROLE_PERMISSION_TARGET_UNKNOWN',
    message: `No ${targetType} named "${targetName}" is declared in the site's schema.`,
    hint:
      targetType === 'collection'
        ? 'Overriding a role permission needs a real defineCollection() — check the spelling against cogenta.schema.*.'
        : 'Overriding a role permission needs a real defineTaxonomy() — check the spelling against cogenta.schema.*.',
    details: { targetType, targetName },
  })
}

function ownNotSupported(targetName: string): CogentaError {
  return new CogentaError({
    code: 'ROLE_PERMISSION_INVALID',
    message: `Taxonomy "${targetName}" has no author, so "own" has no meaning here.`,
    hint: 'Drop "own" — it only applies to a collection action (schema@2.1, ADR-0027).',
    details: { targetName },
  })
}

/**
 * Folds one action's candidate rule into the real, already-validated
 * definition and re-validates the whole thing through `defineCollection` —
 * the single door contract A's permission shape ever passes through. Any
 * other action already on the collection is carried over unchanged.
 */
function validateCollectionCandidate(
  target: CollectionDefinition,
  action: ContentAction,
  roles: readonly string[],
  own: boolean,
): void {
  const permissions: CollectionPermissions = {
    ...target.permissions,
    [action]: own ? { roles, own: true } : [...roles],
  }
  // Throws SCHEMA_INVALID (via `schemaError`) naming every issue, exactly as
  // it would for a hand-edited `cogenta.schema.*` — the only difference here
  // is *where* the candidate came from.
  defineCollection({ ...target, permissions })
}

function validateTaxonomyCandidate(
  target: TaxonomyDefinition,
  action: ContentAction,
  roles: readonly string[],
): void {
  const permissions: CollectionPermissions = { ...target.permissions, [action]: [...roles] }
  defineTaxonomy({ ...target, permissions })
}

/**
 * The three engines report a primary-key collision in three different ways,
 * and none of them is a stable, typed field this project already exposes:
 * Postgres says "duplicate key value violates unique constraint", MySQL and
 * MariaDB `ER_DUP_ENTRY`, SQLite "UNIQUE constraint failed". The cause chain
 * is walked because the driver error arrives wrapped in a `CogentaError`.
 */
function isUniqueViolation(error: unknown): boolean {
  const seen: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    seen.push(current.message)
    const code = (current as { readonly code?: unknown }).code
    if (typeof code === 'string') seen.push(code)
    current = (current as { readonly cause?: unknown }).cause
  }
  return /duplicate key|ER_DUP_ENTRY|UNIQUE constraint failed/iu.test(seen.join(' '))
}

/**
 * Runs `attempt` again when another connection won the same primary key.
 *
 * Bounded, because a caller that keeps losing is a caller stuck in a loop and
 * should hear about it rather than spin. Three is enough for two racers to
 * settle; the last failure is rethrown untouched.
 */
async function retryOnUniqueViolation<T>(attempt: () => Promise<T>): Promise<T> {
  for (let remaining = 3; ; remaining -= 1) {
    try {
      return await attempt()
    } catch (error) {
      if (remaining <= 1 || !isUniqueViolation(error)) throw error
    }
  }
}

export function createRolePermissionStore(
  options: RolePermissionStoreOptions,
): RolePermissionStore {
  const { db, collections, taxonomies } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const table = identifier(ROLE_PERMISSIONS_TABLE, dialect)
  let ready = false

  async function ensureTable(): Promise<void> {
    if (ready) return
    await ensureRolePermissionTable(db)
    ready = true
  }

  function findCollection(name: string): CollectionDefinition | undefined {
    return collections.find((collection) => collection.name === name)
  }

  function findTaxonomy(name: string): TaxonomyDefinition | undefined {
    return taxonomies.find((taxonomy) => taxonomy.name === name)
  }

  return {
    ensureTable,

    list: async () => {
      await ensureTable()
      const found = await db.query<Row>(
        sql`select * from ${table} order by ${identifier('target_type', dialect)} asc, ${identifier('target_name', dialect)} asc, ${identifier('action', dialect)} asc`,
      )
      return found.rows.map(toRecord)
    },

    set: async (input) => {
      await ensureTable()
      const own = input.own === true

      if (input.targetType === 'collection') {
        const target = findCollection(input.targetName)
        if (target === undefined) throw unknownTarget('collection', input.targetName)
        validateCollectionCandidate(target, input.action, input.roles, own)
      } else {
        if (own) throw ownNotSupported(input.targetName)
        const target = findTaxonomy(input.targetName)
        if (target === undefined) throw unknownTarget('taxonomy', input.targetName)
        validateTaxonomyCandidate(target, input.action, input.roles)
      }

      const at = now().toISOString()
      const updatedBy = input.updatedBy ?? null
      const rolesJson = JSON.stringify(input.roles)
      const ownValue = booleanValue(own, dialect)

      // Delete-then-insert is portable but not atomic against another
      // connection doing the same thing: both deletes find nothing, both
      // inserts then race the primary key, and one comes back with a
      // duplicate-key violation. `set()` means "last writer wins", so a
      // collision is a reason to run again — the retry's delete removes the
      // row the winner just wrote — not an error to hand the caller.
      //
      // Only a real two-connection test against a real server ever shows
      // this: SQLite serialises writers, so the race cannot happen there.
      await retryOnUniqueViolation(async () =>
        db.transaction(
          async (tx) => {
            // Delete-then-insert rather than an upsert: `ON CONFLICT`, `ON
            // DUPLICATE KEY` and `INSERT OR REPLACE` are three different
            // statements across the three dialects — the same reasoning
            // `redirects.ts`'s `performAdd` already gives for its own writes.
            await tx.query(
              sql`delete from ${table}
                where ${identifier('target_type', dialect)} = ${input.targetType}
                  and ${identifier('target_name', dialect)} = ${input.targetName}
                  and ${identifier('action', dialect)} = ${input.action}`,
            )
            await tx.query(
              sql`insert into ${table} (
                  ${identifier('target_type', dialect)}, ${identifier('target_name', dialect)},
                  ${identifier('action', dialect)}, ${identifier('roles', dialect)},
                  ${identifier('own', dialect)}, ${identifier('updated_at', dialect)},
                  ${identifier('updated_by', dialect)}
                ) values (
                  ${input.targetType}, ${input.targetName}, ${input.action}, ${rolesJson},
                  ${ownValue}, ${at}, ${updatedBy}
                )`,
            )
          },
          { immediate: true },
        ),
      )

      return {
        targetType: input.targetType,
        targetName: input.targetName,
        action: input.action,
        roles: input.roles,
        own,
        updatedAt: at,
        updatedBy,
      }
    },

    remove: async (targetType, targetName, action) => {
      await ensureTable()
      const result = await db.query(
        sql`delete from ${table}
            where ${identifier('target_type', dialect)} = ${targetType}
              and ${identifier('target_name', dialect)} = ${targetName}
              and ${identifier('action', dialect)} = ${action}`,
      )
      return result.rowsAffected > 0
    },
  }
}
