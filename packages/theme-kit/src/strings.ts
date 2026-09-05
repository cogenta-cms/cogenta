/**
 * The visitor-facing strings a theme asks for through `RenderContext.t`.
 *
 * Until L25, `cogenta serve` handed every theme `t: (key) => key` — so an
 * empty `collectionList` printed the literal text `collection.empty`, and the
 * reading time `theme@1.4` added to article headers would have printed
 * `entry.readingTime` on every post. This is the one table both the host and
 * a test can build a real translator from.
 *
 * Kept deliberately small and flat: these are the dozen strings the block
 * vocabulary needs in every theme, not a site's editorial copy (which lives
 * in content) and not the admin's i18n (which lives in `@cogenta/admin`).
 * A theme that needs a string this table lacks still gets the key back —
 * `t` never returns an empty string — and the gap shows up in a test rather
 * than as a blank on the page.
 */

export type ThemeLocale = 'en' | 'fr'

export type ThemeStrings = Readonly<Record<string, string>>

/** `{{name}}` placeholders, matching the admin's i18next convention so a reader of both sees one syntax. */
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/**
 * The human name of an `embed` provider (contract B's closed `provider`
 * enum). Themes hand `ctx.t` the raw id (`youtube`, `other`) — and "This
 * other embed loads content from a third party. Open on other" is what a
 * restaurant's map placeholder printed before this table existed.
 */
const PROVIDER_LABELS: Readonly<Record<ThemeLocale, Readonly<Record<string, string>>>> = {
  en: {
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    dailymotion: 'Dailymotion',
    spotify: 'Spotify',
    soundcloud: 'SoundCloud',
    bluesky: 'Bluesky',
    mastodon: 'Mastodon',
    other: 'external',
  },
  fr: {
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    dailymotion: 'Dailymotion',
    spotify: 'Spotify',
    soundcloud: 'SoundCloud',
    bluesky: 'Bluesky',
    mastodon: 'Mastodon',
    other: 'externe',
  },
}

export const THEME_STRINGS: Readonly<Record<ThemeLocale, ThemeStrings>> = {
  en: {
    'a11y.skipToContent': 'Skip to content',
    'collection.empty': 'Nothing to show yet.',
    'collection.carousel': 'Scrollable list',
    'collection.featured': 'Featured',
    'embed.consentRequired': 'This {{provider}} embed loads content from a third party.',
    'embed.open': 'Open on {{provider}}',
    'embed.openOther': 'Open the original',
    'embed.title': '{{provider}} embed',
    'embed.unsupported': 'This {{provider}} content cannot be embedded here.',
    'embed.label': 'Embedded content',
    'entry.untitled': 'Untitled',
    'entry.readingTime': '{{minutes}} min read',
    'gallery.carousel': 'Image carousel',
    'hero.actions': 'Actions',
    'theme.toggle.switchToLight': 'Switch to light theme',
    'theme.toggle.switchToDark': 'Switch to dark theme',
    'theme.toggle.switchToSystem': 'Use system theme',
  },
  fr: {
    'a11y.skipToContent': 'Aller au contenu',
    'collection.empty': 'Rien à afficher pour le moment.',
    'collection.carousel': 'Liste défilante',
    'collection.featured': 'À la une',
    'embed.consentRequired': 'Ce contenu {{provider}} est chargé depuis un service tiers.',
    'embed.open': 'Ouvrir sur {{provider}}',
    'embed.openOther': 'Ouvrir l’original',
    'embed.title': 'Contenu {{provider}} intégré',
    'embed.unsupported': 'Ce contenu {{provider}} ne peut pas être intégré ici.',
    'embed.label': 'Contenu intégré',
    'entry.untitled': 'Sans titre',
    'entry.readingTime': '{{minutes}} min de lecture',
    'gallery.carousel': 'Carrousel d’images',
    'hero.actions': 'Actions',
    'theme.toggle.switchToLight': 'Passer au thème clair',
    'theme.toggle.switchToDark': 'Passer au thème sombre',
    'theme.toggle.switchToSystem': 'Utiliser le thème du système',
  },
}

/** `fr-CA` → `fr`; anything this table does not know → `en`. */
export function themeLocaleFor(locale: string): ThemeLocale {
  const language = locale.toLowerCase().split(/[-_]/)[0]
  return language === 'fr' ? 'fr' : 'en'
}

export function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>> | undefined,
): string {
  if (values === undefined) return template
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * A `RenderContext.t` for one locale. Lookup order: the theme's own
 * `overrides` for that locale, this table for that locale, this table's
 * English, then the key itself — so an unknown key is still visible text,
 * never `undefined` or `''` (the contract's own rule for `t`).
 */
export function createThemeTranslator(
  locale: string,
  overrides: Partial<Record<ThemeLocale, ThemeStrings>> = {},
): (key: string, values?: Readonly<Record<string, string | number>>) => string {
  const themeLocale = themeLocaleFor(locale)
  return (key, values) => {
    // A raw provider id becomes its human name; "Open on other" becomes
    // "Open the original" — themes keep passing what the block stores.
    const provider = values?.provider
    const resolvedValues =
      typeof provider === 'string' && PROVIDER_LABELS[themeLocale][provider] !== undefined
        ? { ...values, provider: PROVIDER_LABELS[themeLocale][provider] as string }
        : values
    const resolvedKey = key === 'embed.open' && provider === 'other' ? 'embed.openOther' : key
    const template =
      overrides[themeLocale]?.[resolvedKey] ??
      THEME_STRINGS[themeLocale][resolvedKey] ??
      overrides.en?.[resolvedKey] ??
      THEME_STRINGS.en[resolvedKey] ??
      key
    return interpolate(template, resolvedValues)
  }
}
