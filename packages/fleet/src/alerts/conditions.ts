import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { ALERT_TABLES } from './tables.js'

/**
 * The three real alert conditions built in this task, closed — a caller
 * cannot invent a fourth condition type without a matching detection
 * function to go with it (`./alerts.js`).
 */
export type AlertConditionType = 'critical-risk' | 'campaign-halted' | 'site-silent'

export interface AlertConditionStore {
  /** `true` when this exact (site, condition) pair has an unresolved, unraised-since-clear alert. */
  isActive(siteId: string, conditionType: AlertConditionType): Promise<boolean>
  /**
   * Raises the condition if — and only if — it is not already active:
   * de-duplication is the whole point. Returns `{fired: true}` the first
   * time a condition becomes active, `{fired: false}` on every repeat check
   * while it remains active — a caller sends a real alert only when `fired`
   * is `true`, never once per check cycle.
   */
  raise(
    siteId: string,
    conditionType: AlertConditionType,
    now?: () => number,
  ): Promise<{ readonly fired: boolean }>
  /** Marks the condition resolved — its next `raise()` fires again, a real "was this cleared" check, never a permanent one-time suppression. */
  clear(siteId: string, conditionType: AlertConditionType, now?: () => number): Promise<void>
}

interface ConditionRow {
  id: string
  site_id: string
  condition_type: string
  raised_at: string
  cleared_at: string | null
}

export function createAlertConditionStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): AlertConditionStore {
  const conditions = identifier(ALERT_TABLES.conditions, db.dialect)

  return {
    async isActive(siteId, conditionType) {
      const result = await db.query<ConditionRow>(sql`
        select id from ${conditions}
        where site_id = ${siteId} and condition_type = ${conditionType} and cleared_at is null`)
      return result.rows.length > 0
    },

    async raise(siteId, conditionType, clock = now) {
      const alreadyActive = await this.isActive(siteId, conditionType)
      if (alreadyActive) return { fired: false }
      await db.query(sql`
        insert into ${conditions} (id, site_id, condition_type, raised_at, cleared_at)
        values (${newId(clock)}, ${siteId}, ${conditionType}, ${new Date(clock()).toISOString()}, ${null})`)
      return { fired: true }
    },

    async clear(siteId, conditionType, clock = now) {
      await db.query(sql`
        update ${conditions} set cleared_at = ${new Date(clock()).toISOString()}
        where site_id = ${siteId} and condition_type = ${conditionType} and cleared_at is null`)
    },
  }
}
