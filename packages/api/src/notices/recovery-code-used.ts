import type { AuditLog } from '@cogenta/auth'
import type { AdminNotice, NoticeSource } from './types.js'

/** One recommendation per account — dismissing it silences it until it happens again. */
export const RECOVERY_CODE_USED_ID = 'security.recovery-code-used'

export interface RecoveryCodeUsedOptions {
  readonly audit: AuditLog
  /** How far back a consumption still counts as "recent". Defaults to 30 days. */
  readonly windowMs?: number
  /** Where the admin's own recovery-codes management lives. */
  readonly profileHref?: string
  readonly now?: () => number
}

/**
 * "Consommation d'un code [de récupération] : entrée d'audit **et** notice de
 * sécurité, parce que c'est un événement qui mérite d'être remarqué" (fiche 18
 * task 1).
 *
 * Signing in with a recovery code means the account's usual second factor was
 * unavailable — the person's own choice if the authenticator was simply lost,
 * but exactly what an attacker who stole a printed or copied batch of codes
 * would also produce. Recomputed from the real audit log on every page load,
 * the same way every other notice source is (`types.ts`): there is no state
 * of its own to fall out of sync, and it stops appearing on its own once the
 * event falls outside the window, or the moment it is dismissed.
 */
export function createRecoveryCodeUsedNoticeSource(options: RecoveryCodeUsedOptions): NoticeSource {
  const windowMs = options.windowMs ?? 30 * 24 * 60 * 60 * 1000
  const profileHref = options.profileHref ?? '/profile'
  const now = options.now ?? Date.now

  return {
    name: 'recovery-code-used',
    list: async ({ actor }) => {
      if (actor.id === null) return []

      const since = new Date(now() - windowMs).toISOString()
      const entries = await options.audit.list({
        actorId: actor.id,
        action: 'auth.recovery_code_used',
        since,
        limit: 1,
      })
      if (entries.length === 0) return []

      const notice: AdminNotice = {
        id: RECOVERY_CODE_USED_ID,
        code: RECOVERY_CODE_USED_ID,
        severity: 'warning',
        dismissible: true,
        action: { code: 'security.recovery-code-used.action', href: profileHref },
      }
      return [notice]
    },
  }
}
