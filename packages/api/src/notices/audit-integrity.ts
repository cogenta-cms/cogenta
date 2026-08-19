import type { AuditIntegrityStatus } from '@cogenta/auth'
import type { AdminNotice, NoticeSource } from './types.js'

/** One notice for the whole site — one broken chain, not one alert per admin who loads a page. */
export const AUDIT_INTEGRITY_BROKEN_ID = 'security.audit-integrity-broken'

export interface AuditIntegritySourceOptions {
  /** The scheduled check's store (`@cogenta/auth`'s `createAuditIntegrityStore`) — only its cheap, no-op `status()` read is used here. */
  readonly integrity: { status(): Promise<AuditIntegrityStatus> }
  /** Where an admin goes to look at the detail. The audit log, by default. */
  readonly auditHref?: string
}

/**
 * Fiche 21 task 3's second half: the scheduled check finding a break is
 * worth nothing if nobody ever looks at a screen that mentions it. This is
 * that screen's half — the outbound channel alert is
 * `packages/cli/src/commands/audit-integrity-alert.ts`, reusing the same
 * `AuditIntegrityStatus` this reads.
 *
 * **Not dismissible, on purpose** — same rule as the suspicious-activity
 * notice: a broken hash chain is not an inconvenience to wave away, it is a
 * fact about the log's trustworthiness that stays true until an operator
 * has actually done something about it (typically `prune()`ing the bad
 * prefix after saving it elsewhere). The notice is recomputed from the
 * live status on every page load, so it disappears on its own the moment
 * a forced full check reports `'ok'` again.
 */
export function createAuditIntegritySource(options: AuditIntegritySourceOptions): NoticeSource {
  const auditHref = options.auditHref ?? '/audit'

  return {
    name: 'audit-integrity',
    list: async ({ actor }) => {
      if (actor.id === null || !actor.roles.includes('admin')) return []

      const status = await options.integrity.status()
      if (status.state !== 'broken') return []

      const notice: AdminNotice = {
        id: AUDIT_INTEGRITY_BROKEN_ID,
        code: AUDIT_INTEGRITY_BROKEN_ID,
        severity: 'danger',
        params: { entryId: status.brokenEntryId ?? '?' },
        dismissible: false,
        action: { code: 'security.audit-integrity-broken.action', href: auditHref },
      }
      return [notice]
    },
  }
}
