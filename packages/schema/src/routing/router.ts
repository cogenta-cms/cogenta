import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition } from '../types.js'

/**
 * Turning a URL into "which collection, which locale, which entry" and back.
 *
 * The pattern comes from `routing.pattern` in the collection (contract A):
 * `/blog/:slug`, with the locale prefixed when `routing.locale` is true. Nothing
 * here touches the database — a route match is a statement about the *shape* of
 * a URL, and the lookup that follows belongs to the persistence layer.
 */

export interface RouteMatch {
  readonly collection: string
  /** Null when the collection is not localised. */
  readonly locale: string | null
  readonly params: Readonly<Record<string, string>>
}

export interface RouteOptions {
  /**
   * The locales the site serves.
   *
   * Without it, `/blog/fr` and `/fr/blog` are indistinguishable guesses. The
   * list makes the answer a fact, so pass it whenever the site has one.
   */
  readonly locales?: readonly string[]
  /**
   * The locale a URL carries when it has no prefix.
   *
   * Sites usually serve the source language unprefixed — `/blog/hello` next to
   * `/fr/blog/bonjour`. Leave it unset to require the prefix on every localised
   * route.
   */
  readonly defaultLocale?: string
}

/** A BCP 47 language tag, loose enough for `fr`, `fr-FR` and `zh-Hant-TW`. */
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/

/** `/Blog/Été/` and `/blog/été` are the same route. Case is left alone: paths are case-sensitive. */
export function normalisePath(path: string): string {
  const withoutQuery = path.split(/[?#]/u)[0] ?? ''
  const trimmed = withoutQuery.replace(/\/+$/u, '')
  if (trimmed.length === 0) return '/'
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string): string[] {
  return normalisePath(path)
    .split('/')
    .filter((segment) => segment.length > 0)
}

/**
 * The path an entry is served at.
 *
 * Values are percent-encoded here rather than by the caller: a slug is normally
 * URL-safe already, but a pattern can carry any field, and a category named
 * "R&D" must not produce a broken link.
 */
export function buildPath(
  collection: CollectionDefinition,
  params: Readonly<Record<string, string>>,
  locale?: string,
): string {
  const routing = collection.routing
  if (routing === undefined) {
    throw new CogentaError({
      code: 'CONTENT_ROUTE_INVALID',
      message: `Collection "${collection.name}" has no route.`,
      hint: 'Give it routing: { pattern: "/…/:slug" } before asking for a URL.',
      details: { collection: collection.name },
    })
  }

  const rendered = segmentsOf(routing.pattern).map((segment) => {
    if (!segment.startsWith(':')) return segment

    const name = segment.slice(1)
    const value = params[name]
    if (value === undefined || value.length === 0) {
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: `The route of "${collection.name}" needs a value for ":${name}".`,
        hint: `Pass "${name}" in the parameters. It matches the field of the same name.`,
        details: { collection: collection.name, pattern: routing.pattern, missing: name },
      })
    }
    return encodeURIComponent(value)
  })

  if (routing.locale === true) {
    if (locale === undefined || locale.length === 0) {
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: `The route of "${collection.name}" is localised and needs a locale.`,
        hint: 'Pass the locale of the entry. It is a system field, so every entry has one.',
        details: { collection: collection.name, pattern: routing.pattern },
      })
    }
    rendered.unshift(encodeURIComponent(locale))
  }

  return `/${rendered.join('/')}`
}

/**
 * The collection and parameters a path resolves to, or null.
 *
 * Collections are tried in the order given. A more specific pattern must be
 * declared before a more general one, exactly as in a router table — guessing
 * specificity is how routers acquire behaviour nobody can predict.
 */
export function matchPath(
  collections: readonly CollectionDefinition[],
  path: string,
  options: RouteOptions = {},
): RouteMatch | null {
  const segments = segmentsOf(path).map(decodeSegment)

  for (const collection of collections) {
    const match = matchCollection(collection, segments, options)
    if (match !== null) return match
  }

  return null
}

function matchCollection(
  collection: CollectionDefinition,
  segments: readonly string[],
  options: RouteOptions,
): RouteMatch | null {
  const routing = collection.routing
  if (routing === undefined) return null

  const pattern = segmentsOf(routing.pattern)

  if (routing.locale !== true) {
    const params = matchSegments(pattern, segments)
    return params === null ? null : { collection: collection.name, locale: null, params }
  }

  const prefix = segments[0]
  if (prefix !== undefined && isLocale(prefix, options)) {
    const params = matchSegments(pattern, segments.slice(1))
    if (params !== null) return { collection: collection.name, locale: prefix, params }
  }

  // No prefix: only a site that serves a default locale unprefixed can answer.
  if (options.defaultLocale === undefined) return null

  const params = matchSegments(pattern, segments)
  return params === null
    ? null
    : { collection: collection.name, locale: options.defaultLocale, params }
}

function matchSegments(
  pattern: readonly string[],
  segments: readonly string[],
): Record<string, string> | null {
  if (pattern.length !== segments.length) return null

  const params: Record<string, string> = {}
  for (const [index, expected] of pattern.entries()) {
    const actual = segments[index]
    if (actual === undefined || actual.length === 0) return null

    if (expected.startsWith(':')) {
      params[expected.slice(1)] = actual
      continue
    }
    if (expected !== actual) return null
  }

  return params
}

function isLocale(segment: string, options: RouteOptions): boolean {
  if (options.locales !== undefined) return options.locales.includes(segment)
  return LANGUAGE_TAG.test(segment)
}

/** A malformed escape is not a route; it must not take the process down. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
