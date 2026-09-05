import { CogentaError, type DatabaseHandle, type Logger } from '@cogenta/core'
import {
  createSiteSettingsStore,
  ensureSiteSettingsTables,
  SITE_SETTINGS_SITE_SCOPE,
  siteSettingByKey,
} from '@cogenta/schema'

/**
 * Seeds a blueprint's `siteSettings` (L25 task A0b, D4) through the real
 * `SiteSettingsStore` (`@cogenta/schema`) — `general.tagline`,
 * `general.socialLinks`, `general.footerNote`, etc.
 *
 * Tolerant of a key the registry does not (yet) declare: another agent is
 * extending `SITE_SETTINGS_REGISTRY` with `general.socialLinks`/
 * `general.footerNote` in parallel with this task (Phase 0 — A0a), so a
 * blueprint naming one of those keys before that lands must not fail the
 * whole scaffold — it logs a warning and moves on. Any other failure (a
 * value that fails the key's own schema, which is a real bug in the
 * blueprint) still throws.
 */
/** Returns how many of `values` were actually written — the rest were unknown keys, logged and skipped. */
export async function seedSiteSettings(
  db: DatabaseHandle,
  defaultLocale: string,
  values: Readonly<Record<string, unknown>>,
  adminId: string | null,
  logger: Logger,
): Promise<number> {
  const entries = Object.entries(values)
  if (entries.length === 0) return 0

  await ensureSiteSettingsTables(db)
  const store = createSiteSettingsStore({ db })
  let written = 0

  for (const [key, value] of entries) {
    const definition = siteSettingByKey(key)
    if (definition === undefined) {
      logger.warn('skipping a blueprint site setting the registry does not declare', { key })
      continue
    }
    const locale = definition.scope === 'site' ? SITE_SETTINGS_SITE_SCOPE : defaultLocale
    try {
      await store.set(key, locale, value, adminId)
      written++
    } catch (error) {
      if (error instanceof CogentaError && error.code === 'SITE_SETTING_UNKNOWN') {
        logger.warn('skipping a blueprint site setting the registry does not declare', { key })
        continue
      }
      throw error
    }
  }

  return written
}
