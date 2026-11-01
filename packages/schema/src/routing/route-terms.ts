import type { CollectionDefinition } from '../types.js'

/**
 * The category segment of an entry URL (`schema@2.5`).
 *
 * A pattern parameter that names a **single-valued `taxonomy` field** —
 * `/blog/:category/:slug` — is not the field's raw value (a term id, which
 * means nothing in a URL) but the **slug of the assigned term**. A term slug
 * is unique across its whole taxonomy and is not translated (labels are), so
 * the segment is the same in every language of a translation family.
 *
 * The segment is *optional by construction*: an entry with no term has no
 * category to name, and its canonical URL leaves the segment out
 * (`/blog/<slug>`). `buildPath` omits it, `matchPath` accepts the path with and
 * without it, and the layer that serves pages answers any address other than
 * the canonical one with a 301 — so a renamed term, a moved article and every
 * URL minted before the pattern changed keep working.
 *
 * Everything in this file is synchronous and pure except `routeParamsOf`,
 * which reads term slugs through whatever `TermSlugs` the caller supplies.
 */

/** Where a term's slug comes from. Absent or `null`: the term has no address. */
export interface TermSlugs {
  slug(taxonomy: string, termId: string): Promise<string | null>
}

const PARAMETER = /^:([a-zA-Z_][a-zA-Z0-9_]*)$/u

/** The `:name` parameters of a route pattern, in order. */
export function routeParameterNames(pattern: string): readonly string[] {
  const names: string[] = []
  for (const segment of pattern.split('/')) {
    const match = PARAMETER.exec(segment)
    if (match?.[1] !== undefined) names.push(match[1])
  }
  return names
}

/**
 * The pattern parameters that are a category segment, as `parameter -> taxonomy`.
 *
 * Only a taxonomy field with `many: false` qualifies: an entry in several terms
 * has no single category, and a URL cannot name "all of them".
 */
export function taxonomySegments(collection: CollectionDefinition): ReadonlyMap<string, string> {
  const segments = new Map<string, string>()
  const pattern = collection.routing?.pattern
  if (pattern === undefined) return segments

  for (const name of routeParameterNames(pattern)) {
    const field = collection.fields[name]
    if (field === undefined || field.kind !== 'taxonomy') continue
    if (field.options.many !== false) continue
    const taxonomy = field.options.of
    if (typeof taxonomy === 'string') segments.set(name, taxonomy)
  }
  return segments
}

/** True when `name` is a category segment of this collection's route — the one parameter a URL may omit. */
export function isOptionalRouteParam(collection: CollectionDefinition, name: string): boolean {
  return taxonomySegments(collection).has(name)
}

/** The entry fields a route reads, without the term resolution. */
interface RouteSource {
  readonly values: Readonly<Record<string, unknown>>
}

/**
 * The category segments of an entry: `parameter -> term slug`, for the terms
 * that resolve. A parameter with no term (or whose term is gone) is absent.
 */
export async function termSegmentsOf(
  collection: CollectionDefinition,
  entry: RouteSource,
  terms: TermSlugs | undefined,
): Promise<Record<string, string>> {
  const segments: Record<string, string> = {}
  if (terms === undefined) return segments

  for (const [name, taxonomy] of taxonomySegments(collection)) {
    const value = entry.values[name]
    if (typeof value !== 'string' || value.length === 0) continue
    const slug = await terms.slug(taxonomy, value)
    if (slug !== null && slug.length > 0) segments[name] = slug
  }
  return segments
}

/**
 * The parameters `buildPath` needs for an entry: every string value, with the
 * category segments replaced by the slug of their term.
 *
 * This is the one place a route's parameters are derived from an entry. A
 * caller that spread `entry.values` into `buildPath` itself would put a term id
 * in the URL, which is exactly what this function exists to prevent.
 */
export async function routeParamsOf(
  collection: CollectionDefinition,
  entry: RouteSource,
  terms: TermSlugs | undefined,
): Promise<Record<string, string>> {
  const params: Record<string, string> = {}
  for (const [name, value] of Object.entries(entry.values)) {
    if (typeof value === 'string') params[name] = value
  }
  for (const name of taxonomySegments(collection).keys()) delete params[name]
  return { ...params, ...(await termSegmentsOf(collection, entry, terms)) }
}

/**
 * The matched parameters an entry is looked up by: all of them but the category
 * segment. The segment is a *claim* about where the entry lives (a term slug,
 * not a field value), so it is checked against the entry afterwards — by
 * comparing the address with the canonical one — rather than used to find it.
 */
export function lookupParams(
  collection: CollectionDefinition,
  params: Readonly<Record<string, string>>,
): Record<string, string> {
  const categories = taxonomySegments(collection)
  return Object.fromEntries(Object.entries(params).filter(([name]) => !categories.has(name)))
}
