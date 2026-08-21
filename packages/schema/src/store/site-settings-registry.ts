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
  /**
   * A closed choice, rendered as a `<select>`. Fiche 34 task 4's first user:
   * `commerce.priceDisplay` (`ttc`/`ht`) — free text would let an operator
   * type a third value the totals engine does not know what to do with.
   */
  'select',
  /**
   * A single optional media reference, rendered as `MediaPicker` (fiche L21
   * task 8's first and only user: `branding.customLogoMediaId`). The value
   * stored is a media id, or `''` for "unset" — a plain string, like every
   * other value this registry holds; nothing here talks to `MediaStore`
   * directly, exactly the way a `path` setting names a route without
   * checking the route exists.
   */
  'media',
] as const

export type SiteSettingUiType = (typeof SITE_SETTING_UI_TYPES)[number]

export const SITE_SETTING_GROUPS = [
  'general',
  'reading',
  'discussion',
  'media',
  'privacy',
  /**
   * The shop-wide settings of fiche 34 task 4 — currency, tax-inclusive vs.
   * exclusive display, countries served, minimum order, default backorder
   * policy, and the invoice mentions of task 5. `commerce.tosPagePath` and
   * `commerce.returnPolicyPagePath` are, deliberately, **paths** here —
   * exactly the way `reading.homePath`/`privacy.policyPath` already point at
   * a real content entry rather than storing legal text as a settings field
   * (fiche 34 § pièges: "les CGV doivent être une page publique").
   */
  'commerce',
  /**
   * Cogenta's own credit and white-label override (fiche L21 task 8) —
   * whether the public footer and the admin shell name Cogenta at all, and
   * what replaces it when they don't. Editorial on purpose: a reseller
   * turns this off from the admin the same way any other setting here
   * changes, with no redeploy and no code touched.
   */
  'branding',
  /**
   * Search-engine visibility (fiche 21 task 3): title/description templates,
   * per-collection sitemap hints, and social-card defaults. Previously
   * `seo.tsx` was read-only "by design" — that was a scope choice of a
   * previous lot, never an ADR, and this group is what makes it editable
   * without inventing a second settings store: exactly the same registry
   * that already backs `SettingsRoute`, just with its own screen
   * (`SeoRoute`) rather than a tab there, the same way `commerce` gets its
   * own screen instead of a `SettingsRoute` tab.
   */
  'seo',
  /**
   * OpenTelemetry tracing and structured-log collection (fiche L22 task 5).
   * Editorial on purpose, unlike the OTLP export destination (which stays in
   * `cogenta.config.mjs`'s `observability` section, because it can carry a
   * bearer-token header — rule R7): whether the local recent-events buffer
   * runs at all, and how verbose it is, are exactly the kind of switch an
   * admin should be able to flip from the "Exploitation" screen with no
   * redeploy, the same way `discussion.enabled` already works.
   */
  'observability',
  /**
   * L22 task 4 — which collections the writing assistant's vector index
   * actually contains. Its own screen (the redesigned `AssistantRoute`),
   * not a `SettingsRoute` tab, for the same reason `commerce`/`seo` get
   * their own: the one key this group holds (`assistant.indexedCollections`)
   * is a per-collection map, not a single scalar a generic form field can
   * render — exactly `seo.sitemapCollectionSettings`'s own shape.
   */
  'assistant',
] as const

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
  /** Only meaningful for `uiType: 'select'` — the closed set of choices the admin renders. */
  readonly options?: readonly { readonly value: string; readonly label: string }[]
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

/** A path or an absolute URL, or empty — `seo.defaultSocialImageUrl`'s own shape (fiche 21 task 3). */
const urlOrPathOrEmpty = z
  .string()
  .max(500)
  .refine((value) => value === '' || value.startsWith('/') || /^https?:\/\//u.test(value), {
    error: 'Must be empty, a site-relative path starting with "/", or an absolute http(s) URL.',
  })

/**
 * `%title%`/`%site%` composition (`@cogenta/seo`'s `applyTitleTemplate`).
 * Required to actually contain `%title%` when set — a template that drops it
 * silently replaces every title on the site with the same static string,
 * which is never what "add a suffix" meant.
 */
const titleTemplateOrEmpty = z
  .string()
  .max(200)
  .refine((value) => value === '' || value.includes('%title%'), {
    error: 'A title template must include the %title% token, or be left empty.',
  })

/** `seo.collectionTitleTemplates` — `titleTemplateOrEmpty`, one per collection name (fiche 21 task 3). */
const collectionTitleTemplates = z.record(z.string(), titleTemplateOrEmpty)

const metaDescriptionOrEmpty = z.string().max(500)

/** A Twitter/X `@handle` for `twitter:site`, or empty. */
const twitterHandleOrEmpty = z
  .string()
  .max(16)
  .refine((value) => value === '' || /^@[A-Za-z0-9_]{1,15}$/u.test(value), {
    error:
      'Must be empty, or a handle starting with "@" (letters, digits, underscore, max 15 characters).',
  })

const changeFrequencyOrEmpty = z.enum([
  '',
  'always',
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'yearly',
  'never',
])

/** `seo.sitemapCollectionSettings` — one override per collection name (fiche 21 task 3, mirrors `@cogenta/seo`'s `SitemapCollectionOverride`). */
const sitemapCollectionSettings = z.record(
  z.string(),
  z.object({
    included: z.boolean(),
    changefreq: changeFrequencyOrEmpty,
    // '' means "no hint" — kept as a string in storage so an empty text
    // input round-trips without becoming `NaN` on the way back in.
    priority: z.union([z.literal(''), z.number().min(0).max(1)]),
  }),
)

/**
 * `assistant.indexedCollections` (L22 task 4) — one boolean per collection
 * name, `false` meaning "excluded from the vector index". A collection
 * absent from the map is included: the opt-out shape is what keeps a site
 * that has never touched this setting indexing exactly as it always has.
 */
const indexedCollectionsSettings = z.record(z.string(), z.boolean())

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
  /**
   * L21 task 5's "blocs de départ" — the admin's new-entry flow prefills a
   * fresh `blocks` field with these, instead of the empty array it wrote
   * before this setting existed, so an MCP call or a person opening a new
   * page never has to know every block type just to get something sane on
   * the page. Kept out of contract A on purpose (`defineCollection` gains no
   * `defaultBlocks` option — that would be a frozen-schema change, and the
   * lot's own note says to avoid it): this is a pure admin default, not
   * something a headless client's own `POST` ever sees or is bound by.
   *
   * A comma-separated list of contract B block type names rather than a new
   * `uiType` — the same shape `commerce.countriesServed` already uses for a
   * short closed-ish list — because `@cogenta/schema` cannot import
   * `@cogenta/blocks` (the dependency runs the other way) to validate
   * against the real vocabulary here; the admin's own copy
   * (`blocks/vocabulary.ts`) does that filtering when it reads this value,
   * silently dropping a name it does not recognise rather than crashing the
   * new-entry screen over a typo in a setting.
   */
  {
    key: 'content.newEntryDefaultBlocks',
    group: 'general',
    order: 6,
    uiType: 'string',
    scope: 'site',
    schema: z
      .string()
      .max(500)
      .regex(/^$|^[a-zA-Z][a-zA-Z0-9]*(\s*,\s*[a-zA-Z][a-zA-Z0-9]*)*$/u, {
        error:
          'A comma-separated list of block type names, e.g. "prose". Empty means no starting blocks.',
      }),
    defaultValue: 'prose',
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

  // Discussion (fiche 15 task 5, ADR-0025) — the site-wide defaults every
  // collection and every entry inherit from unless it has its own override.
  // Per-collection and per-entry overrides do NOT live here: this registry
  // is site/locale scoped only, with no notion of "per collection" — they
  // live in `@cogenta/comments`'s own `CommentSettingsStore` instead (see
  // its module comment for why), which reads `discussion.enabled` and
  // `discussion.moderationRequired` as the bottom of its own inheritance
  // chain (`effectiveEnabled`/`effectiveModerationRequired`).
  {
    key: 'discussion.enabled',
    group: 'discussion',
    order: 0,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    defaultValue: true,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'discussion.moderationRequired',
    group: 'discussion',
    order: 1,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    // On by default: a comment nobody moderated appearing on a live page is
    // the surprise a new site owner least wants (fiche 15's own comparison
    // to WordPress, which ships the same default).
    defaultValue: true,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'discussion.allowAnonymous',
    group: 'discussion',
    order: 2,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    defaultValue: true,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'discussion.autoCloseDays',
    group: 'discussion',
    order: 3,
    uiType: 'number',
    scope: 'site',
    // 0 means "never auto-close" — not every site wants an expiry, and 0 is
    // a clearer way to say that than a second boolean that could disagree
    // with this number.
    schema: z.number().int().min(0).max(3650),
    defaultValue: 0,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'discussion.maxNestingDepth',
    group: 'discussion',
    order: 4,
    uiType: 'number',
    scope: 'site',
    schema: z.number().int().min(1).max(10),
    defaultValue: 5,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'discussion.notifyEmail',
    group: 'discussion',
    order: 5,
    uiType: 'email',
    scope: 'site',
    schema: emailOrEmpty,
    defaultValue: '',
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

  // Commerce (fiche 34 task 4) — general store settings. `commerce.currency`
  // and `commerce.priceDisplay` feed the checkout's own totals engine
  // (@cogenta/commerce) as the *default* when an order does not say
  // otherwise; they never duplicate a value the totals engine itself owns.
  {
    key: 'commerce.currency',
    group: 'commerce',
    order: 0,
    uiType: 'string',
    scope: 'site',
    schema: z
      .string()
      .regex(/^[A-Z]{3}$/u, { error: 'A currency is a three-letter ISO 4217 code, e.g. "EUR".' }),
    defaultValue: 'EUR',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.priceDisplay',
    group: 'commerce',
    order: 1,
    uiType: 'select',
    scope: 'site',
    schema: z.enum(['ttc', 'ht']),
    // Tax-inclusive by default — the European convention this codebase's own
    // tax engine already documents (`TaxRule.includedInPrice`).
    defaultValue: 'ttc',
    options: [
      { value: 'ttc', label: 'Tax-inclusive (TTC)' },
      { value: 'ht', label: 'Tax-exclusive (HT)' },
    ],
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.countriesServed',
    group: 'commerce',
    order: 2,
    uiType: 'text',
    scope: 'site',
    // Comma-separated ISO 3166-1 alpha-2 codes. Empty means "every country" —
    // the same "unset means no restriction" convention `path` settings use.
    schema: z
      .string()
      .max(2000)
      .refine(
        (value) =>
          value
            .split(',')
            .map((code) => code.trim())
            .filter((code) => code !== '')
            .every((code) => /^[A-Z]{2}$/u.test(code)),
        {
          error:
            'Each country must be a two-letter ISO 3166-1 code, comma-separated (e.g. "FR, BE, LU").',
        },
      ),
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.minOrderSubtotalMinor',
    group: 'commerce',
    order: 3,
    uiType: 'number',
    scope: 'site',
    // Minor units, like every other amount in @cogenta/commerce (ADR-0006) —
    // 0 means no minimum.
    schema: z.number().int().nonnegative().max(1_000_000_000),
    defaultValue: 0,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.allowBackorderDefault',
    group: 'commerce',
    order: 4,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    defaultValue: false,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.tosPagePath',
    group: 'commerce',
    order: 5,
    uiType: 'path',
    scope: 'site',
    schema: pathOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.returnPolicyPagePath',
    group: 'commerce',
    order: 6,
    uiType: 'path',
    scope: 'site',
    schema: pathOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },

  // Commerce — invoice template (fiche 34 task 5). `billing` (legal name,
  // address, tax id, footer) stays in `cogenta.config.mjs` — ADR-0024's
  // seller identity, and infrastructure per ADR-0025's classification. These
  // four are editorial on top of it: how numbering and wording read, which a
  // shop owner changes without redeploying.
  {
    key: 'commerce.invoiceSeriesPrefix',
    group: 'commerce',
    order: 7,
    uiType: 'string',
    scope: 'site',
    // Prepended to the year-based series (`formatInvoiceNumber`), e.g.
    // "AC" + "2026" => series "AC2026". Empty keeps today's plain year series.
    schema: z
      .string()
      .max(20)
      .regex(/^[A-Za-z0-9-]*$/u, {
        error: 'A series prefix may only contain letters, digits and hyphens.',
      }),
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.invoicePaymentTerms',
    group: 'commerce',
    order: 8,
    uiType: 'text',
    scope: 'site',
    schema: freeText,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'commerce.invoiceLanguage',
    group: 'commerce',
    order: 9,
    uiType: 'string',
    scope: 'site',
    schema: z.string().max(10),
    defaultValue: 'en',
    writeRoles: ADMIN_ONLY,
  },

  // Branding (fiche L21 task 8) — Cogenta's own credit, and its white-label
  // override. Read publicly (GET /api/settings is unauthenticated, exactly
  // like every other setting here): the public footer needs both values on
  // every anonymous request, the same way it already reads `general.title`.
  {
    key: 'branding.showCogentaBranding',
    group: 'branding',
    order: 0,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    // On by default: an install says "built with Cogenta" until someone
    // deliberately turns it off, never the other way round.
    defaultValue: true,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'branding.customLogoMediaId',
    group: 'branding',
    order: 1,
    uiType: 'media',
    scope: 'site',
    // A media id, or '' for "unset" — only meaningful once
    // `showCogentaBranding` is off; kept independent of it so turning
    // Cogenta's credit back on never throws away a logo already uploaded.
    schema: z.string().max(200),
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  // SEO (fiche 21 task 3) — overrides `seo.tsx`'s previous "read-only by
  // design" scope choice (never an ADR): title/description templates,
  // per-collection sitemap hints and social-card defaults, all live-read by
  // `@cogenta/cli`'s render path and by `@cogenta/api`'s `SeoRouter`
  // (`titleDefaults`), never cached at server startup.
  {
    key: 'seo.titleTemplate',
    group: 'seo',
    order: 0,
    uiType: 'string',
    scope: 'site',
    // `%title% — %site%`-style, applied to every page with no per-collection
    // override below and no `seoTitle` field value of its own.
    schema: titleTemplateOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'seo.collectionTitleTemplates',
    group: 'seo',
    order: 1,
    // Bypasses the generic per-`uiType` renderer (`SiteSettingsField`) —
    // `SeoRoute` renders this one key with a bespoke per-collection table
    // instead, the same way `ReadingTab` special-cases `notFoundPath`. `text`
    // is the closest shape in the closed `uiType` set; nothing reads it for
    // this key.
    uiType: 'text',
    scope: 'site',
    schema: collectionTitleTemplates,
    defaultValue: {},
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'seo.defaultMetaDescription',
    group: 'seo',
    order: 2,
    uiType: 'text',
    scope: 'site',
    // Fed into `@cogenta/seo`'s `SeoSite.description`, the fallback every
    // page's own `excerpt`/`seoDescription` already takes priority over.
    schema: metaDescriptionOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'seo.sitemapCollectionSettings',
    group: 'seo',
    order: 3,
    // Bypassed the same way `collectionTitleTemplates` is — see that entry's
    // own comment.
    uiType: 'text',
    scope: 'site',
    schema: sitemapCollectionSettings,
    defaultValue: {},
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'seo.twitterHandle',
    group: 'seo',
    order: 4,
    uiType: 'string',
    scope: 'site',
    // Fed into `@cogenta/seo`'s `SeoSite.twitterSite`, rendered as `twitter:site`.
    schema: twitterHandleOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'seo.defaultSocialImageUrl',
    group: 'seo',
    order: 5,
    uiType: 'path',
    scope: 'site',
    // A plain URL/path setting, deliberately not a media reference: resolving
    // an arbitrary media id at request time would need the render pipeline's
    // media store reachable from a settings read, for one field whose value
    // rarely changes. A site that wants its own asset pastes the same URL
    // `/api/media/{id}/file` or `/_image?id=…` would answer.
    schema: urlOrPathOrEmpty,
    defaultValue: '',
    writeRoles: ADMIN_ONLY,
  },

  // Observability (fiche L22 task 5) — whether the local trace/log
  // collection behind the admin's "Exploitation" screen runs, and how
  // verbose it is. The OTLP export destination itself is not here (see the
  // `observability` group's own doc comment) — this registry only ever
  // holds editorial state, never infra wiring that can carry a secret.
  {
    key: 'observability.enabled',
    group: 'observability',
    order: 0,
    uiType: 'boolean',
    scope: 'site',
    schema: z.boolean(),
    // On by default — fiche L22 task 5's own "actif par défaut pour la
    // collecte et l'affichage local (R1)": a fresh site shows something on
    // its Exploitation screen without anyone having to opt in first.
    defaultValue: true,
    writeRoles: ADMIN_ONLY,
  },
  {
    key: 'observability.logLevel',
    group: 'observability',
    order: 1,
    uiType: 'select',
    scope: 'site',
    schema: z.enum(['error', 'warn', 'info', 'debug']),
    defaultValue: 'info',
    options: [
      { value: 'error', label: 'Error' },
      { value: 'warn', label: 'Warn' },
      { value: 'info', label: 'Info' },
      { value: 'debug', label: 'Debug' },
    ],
    writeRoles: ADMIN_ONLY,
  },
  // Assistant (L22 task 4) — which collections the writing assistant's
  // vector index actually contains. Read live by `cogenta serve` on every
  // content write and by the "Reindex vectors" tool (`@cogenta/cli`'s
  // `isAssistantCollectionEnabled`) — never cached, so a toggle here takes
  // effect on the next save with no restart.
  {
    key: 'assistant.indexedCollections',
    group: 'assistant',
    order: 0,
    // Bypasses the generic per-`uiType` renderer, the same way
    // `seo.sitemapCollectionSettings` does — the redesigned assistant
    // screen renders this one key as a per-collection toggle list instead.
    uiType: 'text',
    scope: 'site',
    schema: indexedCollectionsSettings,
    defaultValue: {},
    writeRoles: ADMIN_ONLY,
  },
] as const

const BY_KEY = new Map(SITE_SETTINGS_REGISTRY.map((entry) => [entry.key, entry]))

export function siteSettingByKey(key: string): SiteSettingDefinition | undefined {
  return BY_KEY.get(key)
}
