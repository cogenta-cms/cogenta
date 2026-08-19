import type { CollectionSummary } from '../schema/types.js'

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

  const rendered: string[] = []
  for (const segment of segmentsOf(routing.pattern)) {
    if (!segment.startsWith(':')) {
      rendered.push(segment)
      continue
    }
    const value = params[segment.slice(1)]
    if (value === undefined || value.length === 0) return null
    rendered.push(encodeURIComponent(value))
  }

  if (routing.locale === true) {
    if (locale === undefined || locale.length === 0) return null
    rendered.unshift(encodeURIComponent(locale))
  }

  return `/${rendered.join('/')}`
}
