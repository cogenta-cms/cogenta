import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { PERMISSION_TABLES } from './tables.js'

/** Why a plugin was killed and disabled — the two real policy violations this task enforces, plus a catch-all for any other worker crash. */
export type PluginViolationReason = 'timeout' | 'memory' | 'crash'

export interface PluginDisabledRecord {
  readonly pluginName: string
  readonly reason: PluginViolationReason
  readonly details: string | null
  readonly disabledAt: string
}

export interface PluginDisableStore {
  /**
   * "Tué et désactivé" — a plugin that exceeds its time or memory limit does
   * not just have that one run terminated, it stops being runnable at all
   * until a human re-enables it. Idempotent: disabling an already-disabled
   * plugin overwrites the record with the newest violation, it does not
   * error or accumulate history.
   */
  disable(pluginName: string, reason: PluginViolationReason, details?: string): Promise<void>

  /** A human decided the plugin is safe to run again. */
  enable(pluginName: string): Promise<void>

  /** The real gate `runPlugin` checks before ever spawning a worker. */
  isDisabled(pluginName: string): Promise<PluginDisabledRecord | null>

  /**
   * Every plugin currently disabled, newest first — what fiche 38's
   * `plugin-disabled` admin notice reads. Separate from `isDisabled` (which
   * answers "is this one plugin blocked") because the notice has to answer
   * "is anything blocked at all" without knowing plugin names in advance.
   */
  listDisabled(): Promise<readonly PluginDisabledRecord[]>
}

interface DisabledRow {
  plugin_name: string
  reason: string
  details: string | null
  disabled_at: string
}

export function createPluginDisableStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): PluginDisableStore {
  const disabled = identifier(PERMISSION_TABLES.disabled, db.dialect)

  return {
    async disable(pluginName, reason, details) {
      await db.query(sql`delete from ${disabled} where plugin_name = ${pluginName}`)
      await db.query(sql`
        insert into ${disabled} (plugin_name, reason, details, disabled_at)
        values (${pluginName}, ${reason}, ${details ?? null}, ${new Date(now()).toISOString()})`)
    },

    async enable(pluginName) {
      await db.query(sql`delete from ${disabled} where plugin_name = ${pluginName}`)
    },

    async isDisabled(pluginName) {
      const result = await db.query<DisabledRow>(
        sql`select * from ${disabled} where plugin_name = ${pluginName}`,
      )
      const row = result.rows[0]
      if (row === undefined) return null
      return {
        pluginName: row.plugin_name,
        reason: row.reason as PluginViolationReason,
        details: row.details,
        disabledAt: row.disabled_at,
      }
    },

    async listDisabled() {
      const result = await db.query<DisabledRow>(
        sql`select * from ${disabled} order by disabled_at desc`,
      )
      return result.rows.map((row) => ({
        pluginName: row.plugin_name,
        reason: row.reason as PluginViolationReason,
        details: row.details,
        disabledAt: row.disabled_at,
      }))
    },
  }
}
