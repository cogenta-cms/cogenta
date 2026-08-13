import type { SqlExecutor } from '../db/index.js'

export interface Migration {
  /** Sortable and stable, e.g. `0001_create_content`. Never renumbered. */
  readonly id: string
  readonly name?: string
  /**
   * Hash of the source this migration came from. When it is present, changing
   * an already-applied migration is detected and refused: two environments that
   * ran different SQL under the same id is the worst state to debug.
   */
  readonly checksum?: string
  /**
   * Removes or rewrites existing data in a way `down` cannot restore. Requires
   * an explicit confirmation and a verified backup before it will run.
   */
  readonly destructive?: boolean
  /** What this does to existing data, in one sentence, for the operator. */
  readonly impact?: string
  readonly estimatedDurationMs?: number

  up(tx: SqlExecutor): Promise<void>
  /**
   * Required, not optional. AGENTS.md says migrations are always reversible, and
   * a type that allows an irreversible one makes that rule a suggestion.
   */
  down(tx: SqlExecutor): Promise<void>
}

export interface MigrationStatus {
  readonly id: string
  readonly name: string
  readonly applied: boolean
  readonly appliedAt: string | undefined
  readonly durationMs: number | undefined
  /** The migration changed after it was applied here. */
  readonly checksumMismatch: boolean
  readonly destructive: boolean
  readonly impact: string | undefined
}

export interface MigrationRecord {
  readonly id: string
  readonly name: string
  readonly checksum: string | null
  readonly appliedAt: string
  readonly durationMs: number
}

export interface RunOptions {
  /** Stop after this migration, inclusive. */
  readonly to?: string
  /** The operator has read the impact of every destructive migration. */
  readonly confirmDestructive?: boolean
  /** A backup was taken **and verified**. Required alongside the confirmation. */
  readonly backupVerified?: boolean
}

export interface RollbackOptions extends RunOptions {
  /** How many applied migrations to revert. Defaults to one. */
  readonly steps?: number
}

export interface MigrationOutcome {
  readonly id: string
  readonly name: string
  readonly direction: 'up' | 'down'
  readonly durationMs: number
}
