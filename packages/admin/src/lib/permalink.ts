import type { CollectionSummary } from '../schema/types.js'

/**
 * The pattern parameters that are a category segment (`schema@2.5`): a
 * single-valued taxonomy field. Its URL segment is the slug of the term, which
 * the entry only holds the id of.
 */
export function categorySegments(
  collection: CollectionSummary,
): readonly { readonly param: string; readonly taxonomy: string }[] {
  const pattern = collection.routing?.pattern
  if (pattern === undefined) return []
  const segments: { param: string; taxonomy: string }[] = []
  for (const segment of pattern.split('/')) {
    if (!segment.startsWith(':')) continue
    const field = collection.fields.find((candidate) => candidate.name === segment.slice(1))
    if (field?.kind !== 'taxonomy' || field.options.many !== false) continue
    const taxonomy = field.options.of
    if (typeof taxonomy === 'string') segments.push({ param: field.name, taxonomy })
  }
  return segments
}

/**
 * Mirrors `packages/schema/src/routing/router.ts`'s `buildPath` — the
 * function `previewPath` already calls server-side to answer "what URL does
 * this entry live at". That module is Node code (imports `CollectionDefinition`
 * from `@cogenta/schema`'s engine types) this browser bundle cannot pull in,
 * for the same reason `schema/types.ts`'s header gives for every other
 * mirrored shape here: JSON is the seam.
 *
 * This is a *preview*, not the source of truth — the "Prévisualiser" button a
 * few lines away in `entry-edit.tsx` still mints a real, server-issued link.
 * A drift between the two would show a slightly wrong permalink while
 * someone is typing, never a broken one: nothing here is asked to persist,
 * and the real preview link always wins by the time it matters.
 */

/** Same behaviour as the server's `segmentsOf`: trims, drops empty segments. */
function segmentsOf(pattern: string): readonly string[] {
  return pattern.split('/').filter((segment) => segment.length > 0)
}

/**
 * The path an entry would be served at, or `null` when there is not enough
 * to build one yet (no route, or a `:param` the collection needs has no
 * value — most commonly the slug, still empty while someone types the title).
 */
export function previewPermalink(
  collection: CollectionSummary,
  params: Readonly<Record<string, string>>,
  locale?: string,
): string | null {
  const routing = collection.routing
  if (routing === undefined) return null

  const categories = new Set(categorySegments(collection).map((category) => category.param))
  const rendered: string[] = []
  for (const segment of segmentsOf(routing.pattern)) {
    if (!segment.startsWith(':')) {
      rendered.push(segment)
      continue
    }
    const value = params[segment.slice(1)]
    // An entry with no category has an address without that segment.
    if ((value === undefined || value.length === 0) && categories.has(segment.slice(1))) continue
    if (value === undefined || value.length === 0) return null
    rendered.push(encodeURIComponent(value))
  }

  if (routing.locale === true) {
    if (locale === undefined || locale.length === 0) return null
    rendered.unshift(encodeURIComponent(locale))
  }

  return `/${rendered.join('/')}`
}
