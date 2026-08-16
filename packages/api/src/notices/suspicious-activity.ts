import type { RateLimiter } from '@cogenta/auth'
import type { AdminNotice, NoticeSource } from './types.js'

/** One notice for the whole site, so repeated attacks do not fill the screen. */
export const SUSPICIOUS_ACTIVITY_ID = 'security.suspicious-activity'

export interface SuspiciousActivityOptions {
  /** The same limiter the sign-in path already writes to; this only reads it. */
  readonly rateLimit: RateLimiter
  /** How many failed attempts, in the limiter's window, are worth saying out loud. */
  readonly minAttempts?: number
  /** Where an admin goes to look at the detail. The audit log, by default. */
  readonly auditHref?: string
}

/**
 * "Détection d'activité suspecte basique — nombreuses tentatives de connexion
 * échouées déjà limitées par `rate-limit.ts`, exposer ça comme alerte dans le
 * dashboard" (L14 task 4).
 *
 * The data has existed since L2 and nothing ever read it: `cogenta_login_attempts`
 * was written on every failure and only ever counted back by the limiter's own
 * `check`. A site being hammered knew it, and told nobody.
 *
 * **Only counts, never the accounts.** The notice says how many failures across
 * how many subjects, and stops there. Naming the emails would turn an admin
 * screen into an account-enumeration surface, and the numbers are what a
 * decision is actually made on — the per-subject detail belongs in the audit
 * log, behind its own permission, which is what `auditHref` points at.
 *
 * **Not dismissible, and that is not nagging.** The notice is recomputed from
 * the live table on every page load and disappears on its own as soon as the
 * attempts fall out of the limiter's fifteen-minute window. A dismissal would
 * silence every future attack too, since there is one stable id for all of them.
 */
export function createSuspiciousActivitySource(options: SuspiciousActivityOptions): NoticeSource {
  const auditHref = options.auditHref ?? '/audit'

  return {
    name: 'suspicious-activity',
    list: async ({ actor }) => {
      // Admin only. An editor can do nothing about a brute-force run against
      // somebody else's account, and telling them one is happening is telling
      // them something about accounts they have no business knowing.
      if (actor.id === null || !actor.roles.includes('admin')) return []

      const summaries = await options.rateLimit.recentFailures(
        options.minAttempts === undefined ? undefined : { minAttempts: options.minAttempts },
      )
      if (summaries.length === 0) return []

      const attempts = summaries.reduce((total, summary) => total + summary.attempts, 0)
      const notice: AdminNotice = {
        id: SUSPICIOUS_ACTIVITY_ID,
        code: SUSPICIOUS_ACTIVITY_ID,
        severity: summaries.some((summary) => summary.blocked) ? 'danger' : 'warning',
        params: { attempts: String(attempts), subjects: String(summaries.length) },
        dismissible: false,
        action: { code: 'security.suspicious-activity.action', href: auditHref },
      }
      return [notice]
    },
  }
}
