import type { CredentialStore } from '@cogenta/auth'
import { requiresMfa } from '@cogenta/auth'
import type { CollectionDefinition } from '@cogenta/schema'
import type { AdminNotice, NoticeSource } from './types.js'

/** The dismissal key and the translation key are the same here: it is one recommendation per account. */
export const MFA_RECOMMENDATION_ID = 'security.mfa-recommended'

export interface MfaRecommendationOptions {
  /** What `requiresMfa` reads to decide which roles are sensitive. */
  readonly collections: readonly CollectionDefinition[]
  readonly credentials: CredentialStore
  /** Where the admin's own "manage my two-step verification" screen lives. */
  readonly profileHref?: string
}

/**
 * The first — and, today, only — real notice source: "this account can publish
 * or administer, and has no second factor".
 *
 * This is the half of ADR-0021 that replaces what was removed. `requiresMfa`
 * used to decide who was refused a session; it now decides who sees this. The
 * account is not blocked, is not nagged with a modal, and can dismiss it — but
 * the recommendation is recomputed from the real state of the credentials on
 * every page load, so it comes back for as long as it is true and disappears
 * the moment enrolment actually happens, with nothing to clean up.
 */
export function createMfaRecommendationSource(options: MfaRecommendationOptions): NoticeSource {
  const profileHref = options.profileHref ?? '/profile'

  return {
    name: 'mfa-recommendation',
    list: async ({ actor }) => {
      if (actor.id === null) return []
      if (!requiresMfa(actor.roles, options.collections)) return []

      // An unconfirmed TOTP secret is somebody who opened the enrolment screen
      // and walked away — sign-in ignores it too (`enrolledFactors` in
      // `@cogenta/auth`), so this account genuinely still has no second factor.
      const totp = await options.credentials.totpSecret(actor.id)
      if (totp?.verified) return []
      if ((await options.credentials.webAuthnCredentials(actor.id)).length > 0) return []

      const notice: AdminNotice = {
        id: MFA_RECOMMENDATION_ID,
        code: MFA_RECOMMENDATION_ID,
        severity: 'warning',
        dismissible: true,
        action: { code: 'security.mfa-recommended.action', href: profileHref },
      }
      return [notice]
    },
  }
}
