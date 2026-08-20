import type { AdminNotice, NoticeSource } from './types.js'

export const PENDING_MIGRATIONS_NOTICE_ID = 'health.migrations-pending'

export interface PendingMigrationsOptions {
  /** How many migrations are pending right now. Cheap and cached by the caller — this runs on every page load. */
  readonly countPending: () => Promise<number>
  readonly hasDestructive: () => Promise<boolean>
  /** Where the admin's own health/migrations screen lives. */
  readonly healthHref?: string
}

/**
 * "Une migration en attente n'est pas signalée" — fiche 24 task 2's second
 * bullet. `cogenta serve` runs whatever schema the last `cogenta migrate up`
 * (or, in development, the schema editor) left behind; a package upgrade
 * that shipped a new migration and was never followed by `migrate up` is
 * exactly the state that produces incomprehensible errors deep in a request
 * with nothing at the surface saying why. This notice is the surface.
 *
 * Never dismissible: dismissing "your schema is stale" would make the next
 * incomprehensible error worse, not better — the health screen already lets
 * an admin see the detail and act (apply the non-destructive ones, or copy
 * the CLI command for the destructive ones).
 */
export function createPendingMigrationsSource(options: PendingMigrationsOptions): NoticeSource {
  const healthHref = options.healthHref ?? '/health'

  return {
    name: 'pending-migrations',
    list: async ({ actor }) => {
      if (actor.id === null) return []
      if (!actor.roles.includes('admin')) return []

      const count = await options.countPending()
      if (count === 0) return []

      const destructive = await options.hasDestructive()

      const notice: AdminNotice = {
        id: PENDING_MIGRATIONS_NOTICE_ID,
        code: destructive ? 'health.migrations-pending-destructive' : 'health.migrations-pending',
        severity: 'warning',
        params: { count: String(count) },
        dismissible: false,
        action: { code: 'health.migrations-pending.action', href: healthHref },
      }
      return [notice]
    },
  }
}
