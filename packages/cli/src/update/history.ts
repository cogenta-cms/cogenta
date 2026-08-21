import type { AuditEntry, AuditLog } from '@cogenta/auth'

/**
 * "Historique des mises à jour et des points de restauration, consultable
 * depuis le même écran" (L22 task 9, point 5).
 *
 * Never a new table: an update check/apply is one more kind of entry in the
 * audit log every other administrative action already writes to — same
 * pattern `scheduled_task.run` uses in `serve.ts`. The *restore point* half
 * of the history is not duplicated here either — it is exactly `cogenta
 * backup list`'s own answer (`@cogenta/export`'s `readBackupManifest` over
 * the `.cogenta/backups` directory), since `restore-point.ts` writes restore
 * points through the very same `createSiteBackup` function backups already
 * use, just tagged with an `update-` filename prefix. The router/CLI layer
 * that serves "history" to the admin screen combines both reads; this module
 * only owns the audit half.
 */

export const UPDATE_CHECKED_ACTION = 'system.update.checked'
export const UPDATE_APPLIED_ACTION = 'system.update.applied'
export const UPDATE_APPLY_FAILED_ACTION = 'system.update.apply_failed'

export interface UpdateHistoryEntryInput {
  readonly actorId: string | null
  readonly actorRoles: readonly string[]
  readonly action:
    | typeof UPDATE_CHECKED_ACTION
    | typeof UPDATE_APPLIED_ACTION
    | typeof UPDATE_APPLY_FAILED_ACTION
  /** Never a secret, never a full npm install log — package names, versions, bump, restore point path, whether contract risk was flagged. */
  readonly diff: Record<string, unknown>
}

export function recordUpdateHistory(
  auditLog: AuditLog,
  entry: UpdateHistoryEntryInput,
): Promise<AuditEntry> {
  return auditLog.record({
    actorId: entry.actorId,
    actorRoles: entry.actorRoles,
    action: entry.action,
    diff: entry.diff,
  })
}

/** Every update-related audit entry, most recent first — the update-system slice of `AuditLog.list()`. */
export async function listUpdateHistory(
  auditLog: AuditLog,
  limit = 50,
): Promise<readonly AuditEntry[]> {
  const [checked, applied, failed] = await Promise.all([
    auditLog.list({ action: UPDATE_CHECKED_ACTION, limit }),
    auditLog.list({ action: UPDATE_APPLIED_ACTION, limit }),
    auditLog.list({ action: UPDATE_APPLY_FAILED_ACTION, limit }),
  ])
  return [...checked, ...applied, ...failed]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit)
}
