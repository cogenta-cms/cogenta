import { type DatabaseHandle, identifier, isCogentaError, sql } from '@cogenta/core'
import type { AuditChainPoint, AuditLog } from './audit.js'
import { TABLES } from './tables.js'

/**
 * Fiche 21 task 3: "un bouton qu'on ne presse jamais ne protège de rien" — a
 * scheduled counterpart to the manual "verify now" button, with somewhere to
 * remember what it last found so the admin screen can say "checked 40
 * seconds ago, chain intact" without replaying the whole log to answer that.
 *
 * Two things this store is careful about:
 *  - **Bounded.** Most runs are `audit.verifyRange(checkpoint)`, not
 *    `audit.verify()` — a million-entry log cannot be replayed on every
 *    tick. A full replay still happens periodically (`fullCheckIntervalMs`,
 *    a week by default) as the "vérification complète plus rare en secours"
 *    the fiche asks for, because an incremental check can only prove the
 *    *suffix* since the last checkpoint is intact — it does not re-read
 *    entries before it, so tampering with already-checkpointed history is
 *    only ever caught by a full run.
 *  - **Sticky once broken.** A break is not quietly retried away: once
 *    `state` is `'broken'`, only an explicit `check({ full: true })` (the
 *    admin's own "verify now", or an operator who has since pruned the bad
 *    prefix) attempts to move past it. Every other tick just re-stamps
 *    `lastCheckedAt` so "still checking" is visible without pretending the
 *    problem went away on its own.
 */

export type AuditIntegrityMode = 'incremental' | 'full'
export type AuditIntegrityState = 'never-run' | 'ok' | 'broken'

export interface AuditIntegrityStatus {
  readonly state: AuditIntegrityState
  readonly checkpoint: AuditChainPoint | null
  readonly entriesChecked: number
  readonly lastCheckedAt: string | null
  readonly lastMode: AuditIntegrityMode | null
  readonly lastFullCheckedAt: string | null
  readonly brokenAt: string | null
  readonly brokenEntryId: string | null
  readonly brokenMessage: string | null
}

export interface AuditIntegrityCheckResult {
  readonly status: AuditIntegrityStatus
  /**
   * `true` only on the run that first found the chain broken — the signal
   * an alert-sending caller should use to actually send one, rather than
   * re-alerting on every subsequent tick while the same break stands.
   */
  readonly newlyBroken: boolean
}

export interface AuditIntegrityStore {
  /** Reads the last outcome without running a new check — cheap, one row. */
  status(): Promise<AuditIntegrityStatus>
  /** Runs a check now. `full: true` forces a full replay instead of the usual incremental one — also what re-attempts past a `'broken'` state. */
  check(options?: { readonly full?: boolean }): Promise<AuditIntegrityCheckResult>
}

export interface AuditIntegrityOptions {
  readonly now?: () => number
  /** How rarely a full replay runs on its own. Default: 7 days. */
  readonly fullCheckIntervalMs?: number
}

const DEFAULT_FULL_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

interface IntegrityRow {
  id: string
  state: string
  checkpoint_id: string | null
  checkpoint_at: string | null
  checkpoint_hash: string | null
  entries_checked: string | null
  last_checked_at: string | null
  last_mode: string | null
  last_full_checked_at: string | null
  broken_at: string | null
  broken_entry_id: string | null
  broken_message: string | null
}

function checkpointOf(
  row: Pick<IntegrityRow, 'checkpoint_id' | 'checkpoint_at' | 'checkpoint_hash'>,
): AuditChainPoint | null {
  if (row.checkpoint_id === null || row.checkpoint_at === null || row.checkpoint_hash === null) {
    return null
  }
  return { id: row.checkpoint_id, at: row.checkpoint_at, hash: row.checkpoint_hash }
}

function statusOf(row: IntegrityRow | null): AuditIntegrityStatus {
  if (row === null) {
    return {
      state: 'never-run',
      checkpoint: null,
      entriesChecked: 0,
      lastCheckedAt: null,
      lastMode: null,
      lastFullCheckedAt: null,
      brokenAt: null,
      brokenEntryId: null,
      brokenMessage: null,
    }
  }
  return {
    state: row.state as AuditIntegrityState,
    checkpoint: checkpointOf(row),
    entriesChecked: row.entries_checked === null ? 0 : Number(row.entries_checked),
    lastCheckedAt: row.last_checked_at,
    lastMode: row.last_mode as AuditIntegrityMode | null,
    lastFullCheckedAt: row.last_full_checked_at,
    brokenAt: row.broken_at,
    brokenEntryId: row.broken_entry_id,
    brokenMessage: row.broken_message,
  }
}

function entryIdOf(details: Readonly<Record<string, unknown>> | undefined): string | null {
  const value = details?.entryId
  return typeof value === 'string' ? value : null
}

export function createAuditIntegrityStore(
  db: DatabaseHandle,
  audit: Pick<AuditLog, 'verifyRange'>,
  options: AuditIntegrityOptions = {},
): AuditIntegrityStore {
  const table = identifier(TABLES.auditIntegrity, db.dialect)
  const now = options.now ?? Date.now
  const fullCheckIntervalMs = options.fullCheckIntervalMs ?? DEFAULT_FULL_CHECK_INTERVAL_MS

  async function readRow(): Promise<IntegrityRow | null> {
    const result = await db.query<IntegrityRow>(
      sql`select * from ${table} where id = ${'singleton'}`,
    )
    return result.rows[0] ?? null
  }

  async function writeRow(row: Omit<IntegrityRow, 'id'>): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query(sql`delete from ${table} where id = ${'singleton'}`)
      await tx.query(sql`
        insert into ${table} (
          id, state, checkpoint_id, checkpoint_at, checkpoint_hash, entries_checked,
          last_checked_at, last_mode, last_full_checked_at, broken_at, broken_entry_id, broken_message
        ) values (
          ${'singleton'}, ${row.state}, ${row.checkpoint_id}, ${row.checkpoint_at}, ${row.checkpoint_hash},
          ${row.entries_checked}, ${row.last_checked_at}, ${row.last_mode}, ${row.last_full_checked_at},
          ${row.broken_at}, ${row.broken_entry_id}, ${row.broken_message}
        )`)
    })
  }

  function dueForFullCheck(row: IntegrityRow | null): boolean {
    if (row === null || row.last_full_checked_at === null) return true
    return now() - Date.parse(row.last_full_checked_at) >= fullCheckIntervalMs
  }

  return {
    status: async () => statusOf(await readRow()),

    check: async (checkOptions = {}) => {
      const row = await readRow()
      const nowIso = new Date(now()).toISOString()

      // Once broken, a plain (unforced) tick only re-stamps that it looked —
      // it does not retry, because nothing about retrying a full or
      // incremental verify would change the outcome until a human has acted
      // (typically `prune()`ing the bad prefix, or restoring from a backup).
      if (row !== null && row.state === 'broken' && checkOptions.full !== true) {
        const { id: _id, ...rest } = row
        const restamped: Omit<IntegrityRow, 'id'> = { ...rest, last_checked_at: nowIso }
        await writeRow(restamped)
        return { status: statusOf({ ...restamped, id: 'singleton' }), newlyBroken: false }
      }

      const wasBroken = row?.state === 'broken'
      const forceFull = checkOptions.full === true || row === null || dueForFullCheck(row)
      const mode: AuditIntegrityMode = forceFull ? 'full' : 'incremental'
      const since = forceFull
        ? null
        : checkpointOf(row ?? { checkpoint_id: null, checkpoint_at: null, checkpoint_hash: null })

      try {
        const result = await audit.verifyRange(since)
        const checkpoint = result.checkpoint ?? since
        const nextRow: Omit<IntegrityRow, 'id'> = {
          state: 'ok',
          checkpoint_id: checkpoint?.id ?? null,
          checkpoint_at: checkpoint?.at ?? null,
          checkpoint_hash: checkpoint?.hash ?? null,
          entries_checked: String(result.entriesChecked),
          last_checked_at: nowIso,
          last_mode: mode,
          last_full_checked_at: mode === 'full' ? nowIso : (row?.last_full_checked_at ?? null),
          broken_at: null,
          broken_entry_id: null,
          broken_message: null,
        }
        await writeRow(nextRow)
        return { status: statusOf({ ...nextRow, id: 'singleton' }), newlyBroken: false }
      } catch (error) {
        if (!isCogentaError(error) || error.code !== 'AUDIT_CHAIN_BROKEN') throw error

        const nextRow: Omit<IntegrityRow, 'id'> = {
          state: 'broken',
          // Frozen at the last point known good — never advanced past a break.
          checkpoint_id: row?.checkpoint_id ?? null,
          checkpoint_at: row?.checkpoint_at ?? null,
          checkpoint_hash: row?.checkpoint_hash ?? null,
          entries_checked: row?.entries_checked ?? '0',
          last_checked_at: nowIso,
          last_mode: mode,
          last_full_checked_at: row?.last_full_checked_at ?? null,
          broken_at: nowIso,
          broken_entry_id: entryIdOf(error.details),
          broken_message: error.message,
        }
        await writeRow(nextRow)
        return { status: statusOf({ ...nextRow, id: 'singleton' }), newlyBroken: !wasBroken }
      }
    },
  }
}
