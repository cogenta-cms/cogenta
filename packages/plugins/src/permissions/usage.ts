import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import type { PluginViolationReason } from './disabled.js'
import { PERMISSION_TABLES } from './tables.js'

/**
 * Fiche 29 task 3 — "Consommation de ressources". `runPlugin`
 * (`../host/worker-runner.js`) already measures a real wall-clock duration
 * for every run (task 3's own text: "ces données sont déjà mesurées ... il
 * s'agit de les exposer, pas de les créer") — what did not exist until this
 * file is a place that survives past the single call to accumulate it.
 *
 * Deliberately does NOT claim a "peak memory observed" figure: Node's
 * `worker_threads` `resourceLimits` sets a ceiling `runIsolated` enforces,
 * it does not report how much of that ceiling a run actually used, and nothing
 * in this codebase measures the worker's real heap usage from the host side.
 * Inventing a number here would be exactly the kind of fabricated metric
 * AGENTS.md's honesty rule forbids. What IS real and is tracked: how long a
 * plugin ran (cumulative and last), how many times it ran, how many of
 * those runs failed and why (mirroring `PluginViolationReason`), and the
 * most recent error message.
 */
export type PluginRunOutcome = 'ok' | 'error' | PluginViolationReason

export interface PluginUsageRecord {
  readonly pluginName: string
  readonly callCount: number
  readonly totalDurationMs: number
  readonly errorCount: number
  readonly timeoutCount: number
  readonly memoryCount: number
  readonly crashCount: number
  readonly lastRunAt: string
  readonly lastDurationMs: number
  readonly lastOutcome: PluginRunOutcome
  readonly lastError: string | null
}

export interface PluginRunObservation {
  readonly durationMs: number
  readonly ok: boolean
  /** Set only when `ok` is `false` and the failure was classified — mirrors `IsolatedRunResult.reason`. */
  readonly reason?: PluginViolationReason
  readonly error?: string
}

export interface PluginUsageStore {
  /** Accumulates one real run's outcome into `pluginName`'s running totals. */
  recordRun(pluginName: string, observation: PluginRunObservation): Promise<void>
  getUsage(pluginName: string): Promise<PluginUsageRecord | null>
  listUsage(): Promise<readonly PluginUsageRecord[]>
  /** Part of fiche 29 task 4's "tout supprimer" uninstall option. */
  clearUsage(pluginName: string): Promise<void>
}

interface UsageRow {
  plugin_name: string
  call_count: number | string
  total_duration_ms: number | string
  error_count: number | string
  timeout_count: number | string
  memory_count: number | string
  crash_count: number | string
  last_run_at: string
  last_duration_ms: number | string
  last_outcome: string
  last_error: string | null
}

function toRecord(row: UsageRow): PluginUsageRecord {
  return {
    pluginName: row.plugin_name,
    callCount: Number(row.call_count),
    totalDurationMs: Number(row.total_duration_ms),
    errorCount: Number(row.error_count),
    timeoutCount: Number(row.timeout_count),
    memoryCount: Number(row.memory_count),
    crashCount: Number(row.crash_count),
    lastRunAt: row.last_run_at,
    lastDurationMs: Number(row.last_duration_ms),
    lastOutcome: row.last_outcome as PluginRunOutcome,
    lastError: row.last_error,
  }
}

function outcomeOf(observation: PluginRunObservation): PluginRunOutcome {
  if (observation.ok) return 'ok'
  return observation.reason ?? 'error'
}

export function createPluginUsageStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): PluginUsageStore {
  const usage = identifier(PERMISSION_TABLES.usage, db.dialect)

  async function getRow(pluginName: string): Promise<UsageRow | undefined> {
    const result = await db.query<UsageRow>(
      sql`select * from ${usage} where plugin_name = ${pluginName}`,
    )
    return result.rows[0]
  }

  return {
    async recordRun(pluginName, observation) {
      const existing = await getRow(pluginName)
      const outcome = outcomeOf(observation)
      const timestamp = new Date(now()).toISOString()

      const callCount = (existing === undefined ? 0 : Number(existing.call_count)) + 1
      const totalDurationMs =
        (existing === undefined ? 0 : Number(existing.total_duration_ms)) + observation.durationMs
      const errorCount =
        (existing === undefined ? 0 : Number(existing.error_count)) + (observation.ok ? 0 : 1)
      const timeoutCount =
        (existing === undefined ? 0 : Number(existing.timeout_count)) +
        (observation.reason === 'timeout' ? 1 : 0)
      const memoryCount =
        (existing === undefined ? 0 : Number(existing.memory_count)) +
        (observation.reason === 'memory' ? 1 : 0)
      const crashCount =
        (existing === undefined ? 0 : Number(existing.crash_count)) +
        (observation.reason === 'crash' ? 1 : 0)
      const lastError = observation.ok ? null : (observation.error ?? null)

      await db.query(sql`delete from ${usage} where plugin_name = ${pluginName}`)
      await db.query(sql`
        insert into ${usage}
          (plugin_name, call_count, total_duration_ms, error_count, timeout_count,
           memory_count, crash_count, last_run_at, last_duration_ms, last_outcome, last_error)
        values
          (${pluginName}, ${callCount}, ${totalDurationMs}, ${errorCount}, ${timeoutCount},
           ${memoryCount}, ${crashCount}, ${timestamp}, ${observation.durationMs}, ${outcome}, ${lastError})`)
    },

    async getUsage(pluginName) {
      const row = await getRow(pluginName)
      return row === undefined ? null : toRecord(row)
    },

    async listUsage() {
      const result = await db.query<UsageRow>(sql`select * from ${usage} order by plugin_name asc`)
      return result.rows.map(toRecord)
    },

    async clearUsage(pluginName) {
      await db.query(sql`delete from ${usage} where plugin_name = ${pluginName}`)
    },
  }
}
