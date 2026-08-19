import type { AuditIntegrityStatus } from '@cogenta/auth'
import { buildAlert } from '@cogenta/channels'
import type { Logger } from '@cogenta/core'

/**
 * Fiche 21 task 3's outbound half. `security-alerts.ts` explains why its own
 * trigger is a request rather than a timer (R1: no durable worker); this one
 * is the accepted exception — `runServe`'s own `setInterval` already is the
 * scheduled-publication tick's clock, and reusing it here rather than
 * inventing a second polling mechanism is the same trade that tick already
 * made.
 *
 * Sent **once per break**, not once per tick: the caller passes `newlyBroken`
 * from `AuditIntegrityStore.check()`, which is `true` only the run that first
 * finds the chain broken. A tick every day for a break nobody has fixed yet
 * would otherwise flood the channel with the same fact.
 */
export interface AuditIntegrityAlertOptions {
  /** `null` disables the outbound half entirely — the admin notice still fires. */
  readonly send: ((event: string, data: Readonly<Record<string, unknown>>) => Promise<void>) | null
  readonly siteUrl: string
  readonly logger: Logger
}

export async function sendAuditIntegrityAlert(
  status: AuditIntegrityStatus,
  options: AuditIntegrityAlertOptions,
): Promise<void> {
  if (options.send === null) return

  try {
    const adminUrl = new URL('/admin/audit', options.siteUrl).toString()
    const entryPart =
      status.brokenEntryId === null
        ? 'The exact entry could not be identified.'
        : `The first affected entry is ${status.brokenEntryId}.`
    const alert = buildAlert({
      title: 'Audit log integrity check failed',
      severity: 'critical',
      context: `The scheduled integrity check found the audit log's hash chain broken. ${entryPart}`,
      expectedAction:
        'Investigate before doing anything else: every entry from this point on cannot be trusted. Preserve the affected rows (do not purge them) until the cause is understood.',
      adminUrl,
    })

    await options.send('security.audit_integrity_broken', {
      severity: alert.severity,
      title: alert.title,
      context: alert.context,
      expectedAction: alert.expectedAction,
      adminUrl: alert.adminUrl,
      brokenEntryId: status.brokenEntryId,
      brokenAt: status.brokenAt,
    })
  } catch (error) {
    // Same rule as every other audit/alert write in this file's neighbours:
    // a notification failing must never fail the check it is reporting on.
    options.logger.error('audit integrity alert failed', { error: String(error) })
  }
}
