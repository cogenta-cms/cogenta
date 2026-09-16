import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import type { PluginBlockProvision, PluginWidgetProvision } from './manifest.js'
import { ensurePluginProvisionTable, PERMISSION_TABLES } from './permissions/tables.js'

/**
 * The memory that makes "uninstalling a plugin degrades a page rather than
 * emptying it" true (L32).
 *
 * A plugin's blocks and widget types are declared in its manifest, which
 * leaves the site with the plugin. What stays behind is content that still
 * names those types — so the site records, the first time it loads a plugin,
 * exactly what it declared. When the plugin is gone, the block is still known:
 * its data still validates, the editor can still save the page, and the
 * renderer still knows which vocabulary block to degrade into and where that
 * block's fields take their values from.
 *
 * Records are never deleted here. A plugin removed today may be reinstalled
 * tomorrow, and a row that outlives one is a few hundred bytes; a row deleted
 * too early is a page that lost its words.
 */

export type PluginProvisionKind = 'block' | 'widget'

export interface PluginProvisionRecord {
  readonly kind: PluginProvisionKind
  readonly name: string
  readonly pluginName: string
  /** The declaration as the manifest wrote it, kept verbatim. */
  readonly declaration: PluginBlockProvision | PluginWidgetProvision
  readonly recordedAt: string
}

export interface PluginProvisionStore {
  /** Writes what these plugins declare, replacing whatever was recorded for the same names. */
  remember(records: readonly Omit<PluginProvisionRecord, 'recordedAt'>[]): Promise<void>
  list(): Promise<readonly PluginProvisionRecord[]>
}

interface ProvisionRow {
  kind: string
  name: string
  plugin_name: string
  declaration: string
  recorded_at: string
}

export function createPluginProvisionStore(db: DatabaseHandle): PluginProvisionStore {
  const table = identifier(PERMISSION_TABLES.provisions, db.dialect)

  return {
    async remember(records) {
      if (records.length === 0) return
      await ensurePluginProvisionTable(db)
      const stamp = new Date().toISOString()
      for (const record of records) {
        // Delete-then-insert rather than an upsert: the three dialects spell
        // upsert differently, and this table is written once per boot with a
        // handful of rows, so the simplest portable form is the right one.
        await db.query(
          sql`delete from ${table} where kind = ${record.kind} and name = ${record.name}`,
        )
        await db.query(sql`
          insert into ${table} (kind, name, plugin_name, declaration, recorded_at)
          values (${record.kind}, ${record.name}, ${record.pluginName},
                  ${JSON.stringify(record.declaration)}, ${stamp})`)
      }
    },

    async list() {
      await ensurePluginProvisionTable(db)
      const rows = await db.query<ProvisionRow>(sql`
        select kind, name, plugin_name, declaration, recorded_at from ${table}`)
      const records: PluginProvisionRecord[] = []
      for (const row of rows.rows) {
        let declaration: PluginBlockProvision | PluginWidgetProvision
        try {
          declaration = JSON.parse(row.declaration) as PluginBlockProvision
        } catch {
          // A row this version cannot read is skipped, never fatal: the site
          // starts, and the block it described falls back to nothing, which is
          // what it would have done anyway.
          continue
        }
        records.push({
          kind: row.kind === 'widget' ? 'widget' : 'block',
          name: row.name,
          pluginName: row.plugin_name,
          declaration,
          recordedAt: row.recorded_at,
        })
      }
      return records
    },
  }
}
