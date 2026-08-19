import type { ApiKeyStore } from '@cogenta/auth'
import type { AdminNotice, NoticeSource } from './types.js'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface ApiKeyExpiryOptions {
  readonly apiKeys: ApiKeyStore
  readonly now?: () => number
  /** Where an admin goes to act on it. The API keys screen, by default. */
  readonly href?: string
}

/**
 * "Une clé qui expire sans prévenir casse une intégration en production"
 * (fiche 20 task 1). One notice per key rather than one aggregate for the
 * whole site, unlike `createSuspiciousActivitySource`: an admin cannot act
 * on "some key is expiring soon" — they need to know *which* one, to rotate
 * or extend it before whatever depends on it starts failing with `401`.
 *
 * Dismissible, and that is safe here in a way it is not for suspicious
 * activity: the id is scoped to one key (`apikey.expiring:<id>`), so
 * dismissing this key's warning never silences another key's, and the
 * underlying fact — this key still expires soon — does not change shape
 * over the following days the way an ongoing attack's count does.
 */
export function createApiKeyExpiryNoticeSource(options: ApiKeyExpiryOptions): NoticeSource {
  const now = options.now ?? Date.now
  const href = options.href ?? '/api-keys'

  return {
    name: 'api-key-expiry',
    list: async ({ actor }) => {
      // Admin only, the same as every other API key route (R4) — a key is
      // an admin's grant, and only an admin can act on its expiry.
      if (actor.id === null || !actor.roles.includes('admin')) return []

      const keys = await options.apiKeys.list()
      const current = now()
      const notices: AdminNotice[] = []

      for (const key of keys) {
        if (key.revokedAt !== undefined) continue
        if (key.expiresAt === undefined) continue

        const msUntilExpiry = new Date(key.expiresAt).getTime() - current
        if (msUntilExpiry <= 0 || msUntilExpiry > SEVEN_DAYS_MS) continue

        notices.push({
          id: `apikey.expiring:${key.id}`,
          code: 'apikey.expiring',
          severity: 'warning',
          params: {
            name: key.name,
            days: String(Math.max(1, Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)))),
          },
          dismissible: true,
          action: { code: 'apikey.expiring.action', href },
        })
      }

      return notices
    },
  }
}
