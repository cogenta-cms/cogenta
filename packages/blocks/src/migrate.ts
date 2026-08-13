import { blockMigrationFailed, invalidBlockDefinition } from './errors.js'
import { type BlockRegistry, vocabularyRegistry } from './registry.js'
import type { UnknownPlacedBlock } from './types.js'
import { parseBlock } from './validate.js'
import { compareBlockVersions, isBlockVersion } from './version.js'

/**
 * Block schema migration (contract B, "Versionnement"; spec L1, "Blocs").
 *
 * Changing the schema of an existing block is a major bump and forces an
 * automatic migration of content already written. That migration runs **on
 * load**, and the migrated version is written back — content never sits in an
 * ambiguous state where nobody can tell which shape the data has.
 */

/** The data of a block, envelope aside. */
export type BlockFields = Record<string, unknown>

/**
 * One step, from one exact version to the next.
 *
 * Steps rather than a jump to the current version: a site that skips three
 * releases replays three small, individually tested transforms instead of one
 * combinatorial one nobody can reason about.
 */
export interface BlockMigration {
  readonly block: string
  readonly from: string
  readonly to: string
  /**
   * Receives the block's data only — never `_key`, `_type` or `_version`. That
   * is what makes the key's survival structural rather than a convention a
   * migration author has to remember.
   */
  migrate(data: Readonly<BlockFields>): BlockFields
}

const ENVELOPE_FIELDS = ['_key', '_type', '_version'] as const

export class BlockMigrationRegistry {
  /** block name → source version → step. One step per source version, at most. */
  readonly #steps = new Map<string, Map<string, BlockMigration>>()

  register(migration: BlockMigration): void {
    const { block, from, to } = migration
    if (!isBlockVersion(from) || !isBlockVersion(to)) {
      throw invalidBlockDefinition(block, `migration ${from} → ${to} uses a non-semver version`)
    }
    if (compareBlockVersions(from, to) >= 0) {
      throw invalidBlockDefinition(block, `migration ${from} → ${to} does not move forward`)
    }
    const forBlock = this.#steps.get(block) ?? new Map<string, BlockMigration>()
    const existing = forBlock.get(from)
    if (existing !== undefined && existing.to !== to) {
      throw invalidBlockDefinition(
        block,
        `two migrations start from ${from} (${existing.to} and ${to}); the path must be unambiguous`,
      )
    }
    forBlock.set(from, migration)
    this.#steps.set(block, forBlock)
  }

  registerAll(migrations: Iterable<BlockMigration>): void {
    for (const migration of migrations) this.register(migration)
  }

  /** The steps that take `from` to `to`, in order. */
  path(block: string, from: string, to: string): BlockMigration[] {
    const forBlock = this.#steps.get(block)
    const steps: BlockMigration[] = []
    let current = from

    while (compareBlockVersions(current, to) < 0) {
      const step = forBlock?.get(current)
      if (step === undefined) {
        throw blockMigrationFailed(block, from, to, `no migration registered from ${current}`)
      }
      if (compareBlockVersions(step.to, to) > 0) {
        throw blockMigrationFailed(
          block,
          from,
          to,
          `the step from ${current} overshoots to ${step.to}`,
        )
      }
      steps.push(step)
      current = step.to
    }
    return steps
  }
}

/** The migrations shipped with the vocabulary. Empty: the twelve are still at 1.0.0. */
export const vocabularyMigrations: BlockMigrationRegistry = new BlockMigrationRegistry()

export interface BlockLoadOptions {
  readonly registry?: BlockRegistry
  readonly migrations?: BlockMigrationRegistry
}

export interface LoadedBlock {
  readonly block: UnknownPlacedBlock
  /** True when the stored form differed and must be written back. */
  readonly migrated: boolean
}

function splitEnvelope(raw: UnknownPlacedBlock): BlockFields {
  const data: BlockFields = {}
  for (const [field, value] of Object.entries(raw)) {
    if (!(ENVELOPE_FIELDS as readonly string[]).includes(field)) data[field] = value
  }
  return data
}

/**
 * Reads one stored block, migrating it to the registered schema version if it
 * lags behind.
 *
 * `migrated` tells the persistence layer to write the result back. Callers that
 * ignore it re-run the migration on every read, which is slow but never wrong —
 * the transform is applied to a copy and validated before it is returned.
 */
export function loadBlock(raw: unknown, options: BlockLoadOptions = {}): LoadedBlock {
  const registry = options.registry ?? vocabularyRegistry
  const migrations = options.migrations ?? vocabularyMigrations

  if (typeof raw !== 'object' || raw === null) {
    return { block: parseBlock(raw, registry), migrated: false }
  }

  const stored = raw as UnknownPlacedBlock
  const type = typeof stored._type === 'string' ? stored._type : ''
  const definition = registry.mustGet(type)
  const from = typeof stored._version === 'string' ? stored._version : ''

  if (!isBlockVersion(from)) {
    throw blockMigrationFailed(
      type,
      from === '' ? '(missing)' : from,
      definition.version,
      'the stored block carries no usable schema version',
    )
  }

  const order = compareBlockVersions(from, definition.version)
  if (order === 0) return { block: parseBlock(stored, registry), migrated: false }
  if (order > 0) {
    // Refuse rather than guess: this is content written by a newer deployment,
    // and dropping the fields it added would be a silent data loss.
    throw blockMigrationFailed(
      type,
      from,
      definition.version,
      'the stored block is newer than the registered schema',
    )
  }

  let data = splitEnvelope(stored)
  for (const step of migrations.path(type, from, definition.version)) {
    try {
      data = step.migrate(Object.freeze({ ...data }))
    } catch (cause) {
      throw blockMigrationFailed(
        type,
        step.from,
        step.to,
        cause instanceof Error ? cause.message : 'the migration threw',
      )
    }
  }

  // The key is re-attached from the stored block, never from the migration's
  // output: a migration cannot change a block's identity even by accident.
  const migratedBlock = {
    ...data,
    _key: stored._key,
    _type: type,
    _version: definition.version,
  }
  return { block: parseBlock(migratedBlock, registry), migrated: true }
}

export interface LoadedBlocks {
  readonly blocks: UnknownPlacedBlock[]
  /** True when at least one block moved, so the zone is worth rewriting. */
  readonly migrated: boolean
}

export function loadBlocks(raws: readonly unknown[], options: BlockLoadOptions = {}): LoadedBlocks {
  const loaded = raws.map((raw) => loadBlock(raw, options))
  return {
    blocks: loaded.map((entry) => entry.block),
    migrated: loaded.some((entry) => entry.migrated),
  }
}
