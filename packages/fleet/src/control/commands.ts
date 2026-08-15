import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { signContent } from '@cogenta/plugins'
import type { ControlPlaneIdentity } from './identity.js'
import { CONTROL_TABLES } from './tables.js'

/**
 * The complete, closed set of things a control plane may ever ask a site to
 * do — "## Appairage": "commandes... exécutables uniquement dans une liste
 * blanche d'actions." `update` and `rollback` are named now, ahead of their
 * real execution logic (tasks 7/8), so this task's transport/verification
 * layer is the real, non-bypassable seam those tasks plug handlers into —
 * not a whitelist widened later under a design already shipped.
 */
export const FLEET_COMMAND_ACTIONS = ['update', 'rollback'] as const
export type FleetCommandAction = (typeof FLEET_COMMAND_ACTIONS)[number]

export interface FleetCommand {
  readonly id: string
  readonly siteId: string
  readonly action: FleetCommandAction
  readonly payload: unknown
  readonly queuedAt: string
}

export interface SignedFleetCommand {
  readonly command: FleetCommand
  /** Base64 Ed25519 signature over the command's canonical content, made with the control plane's own private key — never the site's. */
  readonly signatureBase64: string
}

export interface CommandQueueStore {
  /** Real, persisted, strictly per-site — no cross-site query shape exists anywhere in this store. */
  enqueue(siteId: string, action: FleetCommandAction, payload: unknown): Promise<FleetCommand>
  /**
   * A site's real, pending commands, signed and handed over. Fetching marks
   * every returned command delivered — a site's next fetch never sees it
   * again, closing the "re-fetch the same command forever" gap without
   * pretending to know whether the site went on to execute it (that
   * bookkeeping belongs with tasks 7/8's real execution logic, not here).
   */
  fetchPending(siteId: string): Promise<readonly SignedFleetCommand[]>
}

interface CommandRow {
  id: string
  site_id: string
  action: string
  payload_json: string
  queued_at: string
  delivered_at: string | null
}

function toCommand(row: CommandRow): FleetCommand {
  return {
    id: row.id,
    siteId: row.site_id,
    action: row.action as FleetCommandAction,
    payload: JSON.parse(row.payload_json) as unknown,
    queuedAt: row.queued_at,
  }
}

export function createCommandQueueStore(
  db: DatabaseHandle,
  controlPlaneIdentity: ControlPlaneIdentity,
  now: () => number = Date.now,
): CommandQueueStore {
  const commands = identifier(CONTROL_TABLES.commands, db.dialect)

  return {
    async enqueue(siteId, action, payload) {
      const id = newId(now)
      const queuedAt = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${commands} (id, site_id, action, payload_json, queued_at, delivered_at)
        values (${id}, ${siteId}, ${action}, ${JSON.stringify(payload)}, ${queuedAt}, ${null})`)
      return { id, siteId, action, payload, queuedAt }
    },

    async fetchPending(siteId) {
      const result = await db.query<CommandRow>(sql`
        select id, site_id, action, payload_json, queued_at, delivered_at from ${commands}
        where site_id = ${siteId} and delivered_at is null order by queued_at asc`)
      const pending = result.rows.map(toCommand)
      if (pending.length === 0) return []

      const deliveredAt = new Date(now()).toISOString()
      for (const command of pending) {
        await db.query(
          sql`update ${commands} set delivered_at = ${deliveredAt} where id = ${command.id}`,
        )
      }

      return pending.map((command) => ({
        command,
        signatureBase64: signContent(command, controlPlaneIdentity.privateKey),
      }))
    },
  }
}
