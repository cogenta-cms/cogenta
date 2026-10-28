import type { CollectionDefinition } from '@cogenta/schema'
import type { ChromeLanguage } from '@cogenta/theme-kit'

/**
 * Which language a public URL is in, and how the pages the host owns itself
 * (search, taxonomy archives, the 404 page) are addressed per language.
 *
 * The convention is the one collection routes already follow (`buildPath`
 * with `defaultLocale`): the default language is served unprefixed, every
 * other under `/{locale}/`. It only exists on a site that has several
 * languages *and* at least one collection routed by locale — on any other site
 * `/en/…` is an ordinary path, and a page may even be called that.
 */

export interface LocaleSite {
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

/** Whether some collection is served under a locale prefix. */
export function hasLocalizedRoutes(collections: readonly CollectionDefinition[]): boolean {
  return collections.some((collection) => collection.routing?.locale === true)
}

/** Whether `/{locale}/…` is an address at all on this site. */
export function isLocaleRouted(
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
): boolean {
  return site.locales.length > 1 && hasLocalizedRoutes(collections)
}

/** `''` for the default language (and on a site that does not route by locale), `/en` otherwise. */
export function localePrefix(
  locale: string,
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
): string {
  if (!isLocaleRouted(site, collections) || locale === site.defaultLocale) return ''
  return `/${encodeURIComponent(locale)}`
}

/**
 * The language a path is in and the path without its language prefix:
 * `/en/search` is `{ locale: 'en', rest: '/search' }`, `/search` is the
 * default language's. A prefix that names no language of the site is left
 * in the path.
 */
export function localeOfPath(
  pathname: string,
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
): { readonly locale: string; readonly rest: string } {
  if (isLocaleRouted(site, collections)) {
    const match = /^\/([^/]+)(\/.*)?$/u.exec(pathname)
    const first = match?.[1]
    if (first !== undefined) {
      let decoded = first
      try {
        decoded = decodeURIComponent(first)
      } catch {
        // Not a language prefix: left as it is.
      }
      if (site.locales.includes(decoded)) {
        return { locale: decoded, rest: match?.[2] ?? '/' }
      }
    }
  }
  return { locale: site.defaultLocale, rest: pathname }
}

/** Where the search page of `locale` lives. */
export function searchPathFor(
  locale: string,
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
): string {
  return `${localePrefix(locale, site, collections)}/search`
}

/** `/{taxonomy}/{slug}` in the language's own prefix. */
export function termArchivePathFor(
  taxonomy: string,
  slug: string,
  locale: string,
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
): string {
  return `${localePrefix(locale, site, collections)}/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`
}

/** Where the front door of `locale` lives: `/`, or `/en/`. */
export function homePathFor(
  locale: string,
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
): string {
  return `${localePrefix(locale, site, collections)}/`
}

/** A language's own name — "Français", "English" — which is what a reader looks for. */
export function languageLabel(locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale)
    return name === undefined ? locale : name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
  } catch {
    return locale
  }
}

/**
 * The language switcher of a page the host draws itself (search, an archive,
 * the 404): one entry per language, each pointing at the same page in that
 * language. Empty on a site that does not route by locale.
 */
export function languageSwitcher(
  current: string,
  site: LocaleSite,
  collections: readonly CollectionDefinition[],
  hrefFor: (locale: string) => string,
): readonly ChromeLanguage[] {
  if (!isLocaleRouted(site, collections)) return []
  return site.locales.map((locale) => ({
    locale,
    label: languageLabel(locale),
    href: hrefFor(locale),
    current: locale === current,
  }))
}
