import { type DatabaseHandle, identifier, newId, type SqlFragment, sql } from '@cogenta/core'
import type { TelemetryPayload } from '../agent/types.js'
import { CONTROL_TABLES } from './tables.js'

/** `@cogenta/core`'s `sql` tag has no built-in list helper — nested fragments splice correctly, so a left-fold of one-value fragments joined by `, ` produces real, individually-bound placeholders, never an inlined value. */
function sqlList(values: readonly unknown[]): SqlFragment {
  return values.map((value) => sql`${value}`).reduce((acc, fragment) => sql`${acc}, ${fragment}`)
}

/**
 * How many of a site's most recent telemetry snapshots the control plane
 * keeps. "## Pièges connus" (`docs/lots/L8-flotte.md`): "La télémétrie qui
 * grossit... Rétention et agrégation dès le départ" — a real, bounded number
 * decided now rather than an unbounded table a later task has to notice and
 * fix. 30 covers roughly a month of once-daily contact (the natural cadence
 * for the fields this payload actually carries — CVE status, Core Web
 * Vitals, backup results — none of which need finer-than-daily history for
 * the dashboard/report tasks this lot still has ahead of it) without the
 * unbounded growth the pitfall warns about. A real aggregation/rollup
 * pipeline for longer-term trends is a later task's job, not this one's.
 */
const DEFAULT_RETAIN = 30

export interface TelemetrySnapshot {
  readonly id: string
  readonly siteId: string
  readonly collectedAt: string
  readonly ingestedAt: string
  readonly payload: TelemetryPayload
}

export interface SiteStateStore {
  /** Records one verified snapshot for `siteId`, then prunes down to the retention limit — never called with an unverified payload (`./ingest.js` is the only real caller). */
  recordSnapshot(siteId: string, payload: TelemetryPayload): Promise<TelemetrySnapshot>
  /** The most recent snapshot for one site, or `null` if none exists yet. Always scoped to exactly one `siteId` — there is no "latest across all sites" shape here. */
  latest(siteId: string): Promise<TelemetrySnapshot | null>
  /** Every retained snapshot for one site, most recent first. Always scoped to exactly one `siteId`. */
  history(siteId: string): Promise<readonly TelemetrySnapshot[]>
}

interface SnapshotRow {
  id: string
  site_id: string
  collected_at: string
  ingested_at: string
  payload_json: string
}

function toSnapshot(row: SnapshotRow): TelemetrySnapshot {
  return {
    id: row.id,
    siteId: row.site_id,
    collectedAt: row.collected_at,
    ingestedAt: row.ingested_at,
    payload: JSON.parse(row.payload_json) as TelemetryPayload,
  }
}

export function createSiteStateStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
  retain: number = DEFAULT_RETAIN,
): SiteStateStore {
  const snapshots = identifier(CONTROL_TABLES.telemetrySnapshots, db.dialect)

  return {
    async recordSnapshot(siteId, payload) {
      const id = newId(now)
      const ingestedAt = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${snapshots} (id, site_id, collected_at, ingested_at, payload_json)
        values (${id}, ${siteId}, ${payload.collectedAt}, ${ingestedAt}, ${JSON.stringify(payload)})`)

      // Bounded retention, enforced on every write, not a separate cron job
      // a deployment could forget to schedule: delete anything for this site
      // that falls outside its `retain` most-recent rows.
      const keep = await db.query<{ id: string }>(sql`
        select id from ${snapshots} where site_id = ${siteId}
        order by collected_at desc limit ${retain}`)
      const keepIds = keep.rows.map((row) => row.id)
      if (keepIds.length > 0) {
        await db.query(sql`
          delete from ${snapshots}
          where site_id = ${siteId} and id not in (${sqlList(keepIds)})`)
      }

      return { id, siteId, collectedAt: payload.collectedAt, ingestedAt, payload }
    },

    async latest(siteId) {
      const result = await db.query<SnapshotRow>(sql`
        select id, site_id, collected_at, ingested_at, payload_json from ${snapshots}
        where site_id = ${siteId} order by collected_at desc limit 1`)
      const row = result.rows[0]
      return row === undefined ? null : toSnapshot(row)
    },

    async history(siteId) {
      const result = await db.query<SnapshotRow>(sql`
        select id, site_id, collected_at, ingested_at, payload_json from ${snapshots}
        where site_id = ${siteId} order by collected_at desc`)
      return result.rows.map(toSnapshot)
    },
  }
}
