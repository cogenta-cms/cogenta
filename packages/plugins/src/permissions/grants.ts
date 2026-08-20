import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { PERMISSION_TABLES } from './tables.js'

/** One user-approved capability for one plugin, keyed to the exact capability string. */
export interface PluginGrant {
  readonly pluginName: string
  readonly capability: string
  readonly grantedAt: string
}

export interface PluginGrantStore {
  /**
   * Records that `capability` (the exact string, e.g. `http.fetch:api.exemple.com`)
   * has been approved for `pluginName`. Not this task's job to decide WHO
   * gets to call this or through what UI (task 7's permission screen) — this
   * is the real, minimal data-layer primitive that screen will call.
   */
  grant(pluginName: string, capability: string): Promise<void>

  /** Revoking an already-unrevoked-or-nonexistent grant is not an error — it's already in the state being asked for. */
  revoke(pluginName: string, capability: string): Promise<void>

  /**
   * Revokes every currently-active grant for `pluginName` at once — fiche
   * 29 task 4's "désinstallation propre", the "tout supprimer" option:
   * uninstalling with data removal must leave no lingering capability a
   * reinstalled-but-different plugin could inherit by name collision.
   */
  revokeAll(pluginName: string): Promise<void>

  /** Every currently-active (non-revoked) grant for a plugin. */
  listGrants(pluginName: string): Promise<readonly PluginGrant[]>
}

interface GrantRow {
  id: string
  plugin_name: string
  capability: string
  granted_at: string
  revoked_at: string | null
}

export function createPluginGrantStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): PluginGrantStore {
  const grants = identifier(PERMISSION_TABLES.grants, db.dialect)

  return {
    async grant(pluginName, capability) {
      // Re-granting an already-active capability is idempotent, not a
      // duplicate row — replace rather than accumulate revoked history for
      // the same exact (plugin, capability) pair still active.
      await db.query(
        sql`delete from ${grants} where plugin_name = ${pluginName} and capability = ${capability} and revoked_at is null`,
      )
      await db.query(sql`
        insert into ${grants} (id, plugin_name, capability, granted_at, revoked_at)
        values (${newId(now)}, ${pluginName}, ${capability}, ${new Date(now()).toISOString()}, ${null})`)
    },

    async revoke(pluginName, capability) {
      await db.query(sql`
        update ${grants} set revoked_at = ${new Date(now()).toISOString()}
        where plugin_name = ${pluginName} and capability = ${capability} and revoked_at is null`)
    },

    async revokeAll(pluginName) {
      await db.query(sql`
        update ${grants} set revoked_at = ${new Date(now()).toISOString()}
        where plugin_name = ${pluginName} and revoked_at is null`)
    },

    async listGrants(pluginName) {
      const result = await db.query<GrantRow>(sql`
        select * from ${grants} where plugin_name = ${pluginName} and revoked_at is null order by granted_at asc`)
      return result.rows.map((row) => ({
        pluginName: row.plugin_name,
        capability: row.capability,
        grantedAt: row.granted_at,
      }))
    },
  }
}
