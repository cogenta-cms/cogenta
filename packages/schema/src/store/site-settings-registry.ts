import { z } from 'zod'

/**
 * The declarative registry fiche 23 task 1 asks for: "un magasin clé/valeur
 * typé, avec un schéma Zod déclarant chaque réglage : clé, type, valeur par
 * défaut, portée (site ou locale), permission requise. Un réglage inconnu est
 * refusé — pas un dépotoir de clés libres."
 *
 * Adding a setting is one entry here — `SiteSettingsStore` validates,
 * defaults and scopes every key generically from this list (never a special
 * case per key), and the admin's settings screen renders a field from each
 * entry's `group`/`order`/`uiType` the same way (`site-settings-field.tsx`).
 * That is what makes the fiche's own acceptance test true: "ajouter un
 * réglage nouveau = une ligne de déclaration, et il apparaît à l'écran sans
 * code d'interface supplémentaire."
 *
 * Every key here is **editorial** (ADR-0025's third category) — a rédacteur
 * changes it from the admin, and it never duplicates a field
 * `cogenta.config.mjs` already owns. `general.defaultLocale` and
 * `reading.notFoundPath`, for instance, stay in the config file on purpose
 * (section 8 of the fiche recommends migrating nothing that already exists);
 * the settings screen shows them too, but read-only, mirrored from
 * `SchemaDocument`/`Site.site` rather than declared here.
 */

/** How the admin renders a value — never a free-form widget choice per key. */
export const SITE_SETTING_UI_TYPES = [
  'string',
  'text',
  'email',
  'boolean',
  'path',
  'number',
  'timeZone',
  'dateStyle',
  'timeStyle',
] as const

export type SiteSettingUiType = (typeof SITE_SETTING_UI_TYPES)[number]

export const SITE_SETTING_GROUPS = ['general', 'reading', 'discussion', 'media', 'privacy'] as const

export type SiteSettingGroup = (typeof SITE_SETTING_GROUPS)[number]

export const SITE_SETTING_SCOPES = ['site', 'locale'] as const

export type SiteSettingScope = (typeof SITE_SETTING_SCOPES)[number]

export interface SiteSettingDefinition {
  /** The machine key, `<group-ish>.<name>` by convention — never parsed, just a stable id. */
  readonly key: string
  readonly group: SiteSettingGroup
  /** Sort order within the group, ascending. Ties break on `key`. */
  readonly order: number
  readonly uiType: SiteSettingUiType
  readonly scope: SiteSettingScope
  readonly schema: z.ZodType
  readonly defaultValue: unknown
  /**
   * Only `admin` may write any of these (fiche 23 § "Critères d'acceptation":
   * "réglages éditoriaux réservés à admin"). Kept on the descriptor rather
   * than hardcoded in the router so a future setting could in principle name
   * a different role — none does today, and the router still refuses
   * anything this field does not say.
   */
  readonly writeRoles: readonly string[]
}

const nonEmpty200 = z.string().max(200)
const freeText = z.string().max(4000)
const emailOrEmpty = z.union([z.literal(''), z.email()])
const pathOrEmpty = z
  .string()
  .max(200)
  .refine((value) => value === '' || value.startsWith('/'), {
    error: 'A path must be empty (unset) or start with "/".',
  })

/**
 * A real IANA time zone name, or empty for "not set". `Intl.DateTimeFormat`
 * throws `RangeError` on anything it does not recognise — the same check
 * every JS runtime already performs, reused rather than a hand-rolled list of
 * zone names to keep in sync with the platform's own tzdata.
 */
function isValidTimeZone(value: string): boolean {
  if (value === '') return true
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

const timeZoneOrEmpty = z
  .string()
  .max(64)
  .refine(isValidTimeZone, { error: 'Not a recognised IANA time zone name (e.g. "Europe/Paris").' })

const dateTimeStyle = z.enum(['full', 'long', 'medium', 'short'])

const ADMIN_ONLY = ['admin'] as const

export const SITE_SETTINGS_REGISTRY: readonly SiteSettingDefinition[] = [
  // General
  {
    key: 'general.title',
    group: 'general',
    order: 0,
    uiType: 'string',
    scope: 'site',
    schema: nonEmpty200,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'general.tagline',
    group: 'general',
    order: 1,
    uiType: 'string',
    scope: 'locale',
    schema: nonEmpty200,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'general.adminEmail',
    group: 'general',
    order: 2,
    uiType: 'email',
    scope: 'site',
    schema: emailOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'general.timeZone',
    group: 'general',
    order: 3,
    uiType: 'timeZone',
    scope: 'site',
    schema: timeZoneOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'general.dateStyle',
    group: 'general',
    order: 4,
    uiType: 'dateStyle',
    scope: 'site',
    schema: dateTimeStyle,
    defaultValue: 'medium',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'general.timeStyle',
    group: 'general',
    order: 5,
    uiType: 'timeStyle',
    scope: 'site',
    schema: dateTimeStyle,
    defaultValue: 'short',
    writeRoles: ADMIN_ONLY,
  },

  // Reading
  {
    key: 'reading.homePath',
    group: 'reading',
    order: 0,
    uiType: 'path',
    scope: 'site',
    schema: pathOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'reading.postsPerPage',
    group: 'reading',
    order: 1,
    uiType: 'number',
    scope: 'site',
    schema: z.number().int().min(1).max(100),
    defaultValue: 10,
    writeRoles: ADMIN_ONLY,
  },

  // Media
  {
    key: 'media.maxUploadSizeMb',
    group: 'media',
    order: 0,
    uiType: 'number',
    scope: 'site',
    schema: z.number().int().min(1).max(200),
    defaultValue: 15,
    writeRoles: ADMIN_ONLY,
  },

  // Privacy
  {
    key: 'privacy.policyPath',
    group: 'privacy',
    order: 0,
    uiType: 'path',
    scope: 'site',
    schema: pathOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'privacy.cookieBannerEnabled',
    group: 'privacy',
    order: 1,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    // Off by default and on purpose (fiche 23 § pièges): Cogenta sets no
    // cookie of its own, so a banner nobody asked for would be pure noise —
    // this exists for the site that adds a tracker of its own, not to
    // impose a fixture on every site that does not.
    defaultValue: false,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'privacy.cookieBannerMessage',
    group: 'privacy',
    order: 2,
    uiType: 'text',
    scope: 'site',
    schema: freeText,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'privacy.dataRetentionNote',
    group: 'privacy',
    order: 3,
    uiType: 'text',
    scope: 'site',
    schema: freeText,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
] as const

const BY_KEY = new Map(SITE_SETTINGS_REGISTRY.map((entry) => [entry.key, entry]))

export function siteSettingByKey(key: string): SiteSettingDefinition | undefined {
  return BY_KEY.get(key)
}
