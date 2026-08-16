import type { LoginAttemptSummary, RateLimiter } from '@cogenta/auth'
import { buildAlert } from '@cogenta/channels'
import type { Logger } from '@cogenta/core'

/**
 * The outbound half of L14 task 4 — "exposer ça comme alerte dans le
 * dashboard/canaux, réutilisant `@cogenta/channels`".
 *
 * The dashboard half is `createSuspiciousActivitySource` in `@cogenta/api`.
 * This is the half that leaves the site, and it deliberately reuses two things
 * that already exist rather than inventing a third: `buildAlert` (L6, with its
 * enforced title/severity/context/expected-action/admin-link shape and its
 * screen budget) and the signed webhook sender L14 task 1 just connected. No
 * second notification path, no second signature.
 *
 * **Why the trigger is a failed request, not a timer.** Rule R1 guarantees no
 * durable worker, so anything that "checks periodically" here would be a
 * promise the deployment cannot keep. A brute-force run *is* a stream of
 * requests, so the requests themselves are the clock — which also means the
 * alert arrives while the attack is happening rather than up to a poll
 * interval later.
 */

/** Statuses that mean a sign-in attempt was refused. 429 is the limiter itself. */
const REFUSED_STATUSES: ReadonlySet<number> = new Set([401, 429])

/** At most one alert per this long, however many attempts arrive. */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000

export interface SecurityAlertOptions {
  readonly rateLimit: RateLimiter
  /** Where the alert is delivered. `null` disables the outbound half entirely. */
  readonly send: ((event: string, data: Readonly<Record<string, unknown>>) => Promise<void>) | null
  /** Absolute base URL of the site, for the alert's required admin link. */
  readonly siteUrl: string
  readonly logger: Logger
  /** Attempts inside the limiter's window past which an alert is worth sending. */
  readonly minAttempts?: number
  readonly cooldownMs?: number
  readonly now?: () => number
}

export interface SecurityAlertWatch {
  /**
   * Called after every `/api/auth/*` response. Cheap and silent for the
   * overwhelming majority — a successful sign-in never touches the database
   * here at all.
   */
  observe(status: number): Promise<void>
}

function summarise(summaries: readonly LoginAttemptSummary[]): {
  readonly attempts: number
  readonly subjects: number
  readonly blocked: number
} {
  return {
    attempts: summaries.reduce((total, summary) => total + summary.attempts, 0),
    subjects: summaries.length,
    blocked: summaries.filter((summary) => summary.blocked).length,
  }
}

export function createSecurityAlertWatch(options: SecurityAlertOptions): SecurityAlertWatch {
  const now = options.now ?? Date.now
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  let lastAlertAt = 0

  return {
    observe: async (status) => {
      if (options.send === null) return
      if (!REFUSED_STATUSES.has(status)) return
      // The cooldown is checked *before* the query, not after: a script making
      // twenty attempts a second must not turn into twenty aggregate queries a
      // second. The alert is about a situation, not about one request.
      if (now() - lastAlertAt < cooldownMs) return

      try {
        const summaries = await options.rateLimit.recentFailures(
          options.minAttempts === undefined ? undefined : { minAttempts: options.minAttempts },
        )
        if (summaries.length === 0) return

        const totals = summarise(summaries)
        lastAlertAt = now()

        const adminUrl = new URL('/admin', options.siteUrl).toString()
        // Counts, never the accounts — same rule as the admin notice. An
        // outbound message travels further than a screen does, and an email
        // address in it is an address in somebody else's inbox and logs.
        const alert = buildAlert({
          title: 'Repeated failed sign-in attempts',
          severity: totals.blocked > 0 ? 'critical' : 'warning',
          context: `${totals.attempts} failed sign-in attempts across ${totals.subjects} account(s) in the last 15 minutes${
            totals.blocked > 0 ? `, ${totals.blocked} of them now rate-limited` : ''
          }.`,
          expectedAction:
            'Check the audit log, and confirm the affected accounts still have strong passwords and a second factor.',
          adminUrl,
        })

        await options.send('security.suspicious_activity', {
          severity: alert.severity,
          title: alert.title,
          context: alert.context,
          expectedAction: alert.expectedAction,
          adminUrl: alert.adminUrl,
          attempts: totals.attempts,
          subjects: totals.subjects,
          blocked: totals.blocked,
        })
      } catch (error) {
        // Never let watching a failure turn into a second failure: the sign-in
        // response has already been written by the time this runs.
        options.logger.error('suspicious activity alert failed', { error: String(error) })
      }
    },
  }
}
