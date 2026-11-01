import type { TermSlugs } from '../routing/route-terms.js'

/**
 * Term slugs for the category segment of a URL (`schema@2.5`), read through
 * whatever lists a taxonomy's terms.
 *
 * A page of twelve cards asks for twelve slugs; one `list()` per taxonomy
 * answers all of them, so each taxonomy is read once and kept for a short
 * while rather than once per card. Two things keep the copy honest:
 *
 * - an id the copy does not know triggers one refresh (a term created a moment
 *   ago), at most once per `missRefreshMs` so an id that no longer exists does
 *   not turn every lookup into a query;
 * - `invalidate()` drops it, and `serve` calls that on every write to a term.
 *
 * A slug is stale for at most `ttlMs` on a replica that did not see the write.
 * That is a harmless window: the page is served at the old category segment and
 * the next request, once refreshed, answers it with a 301.
 */

export interface TermSlugResolverOptions {
  /** The terms of a taxonomy, or `undefined` for a taxonomy this site does not have. */
  readonly termsOf: (
    taxonomy: string,
  ) => Promise<readonly { readonly id: string; readonly slug: string }[]> | undefined
  /** How long a taxonomy's terms are kept. Defaults to 5 seconds. */
  readonly ttlMs?: number
  /** The least age a copy must have before an unknown id refreshes it. Defaults to 250 ms. */
  readonly missRefreshMs?: number
  /** Injectable so tests can move time; nothing else should pass it. */
  readonly now?: () => number
}

export interface TermSlugResolver extends TermSlugs {
  /** Forgets one taxonomy, or every taxonomy when none is named. */
  invalidate(taxonomy?: string): void
}

interface Loaded {
  readonly at: number
  readonly byId: ReadonlyMap<string, string>
}

export const DEFAULT_TERM_SLUG_TTL_MS = 5_000
const DEFAULT_MISS_REFRESH_MS = 250

export function createTermSlugResolver(options: TermSlugResolverOptions): TermSlugResolver {
  const ttl = options.ttlMs ?? DEFAULT_TERM_SLUG_TTL_MS
  const missRefresh = options.missRefreshMs ?? DEFAULT_MISS_REFRESH_MS
  const now = options.now ?? ((): number => Date.now())
  const cache = new Map<string, Promise<Loaded | null>>()

  function load(taxonomy: string): Promise<Loaded | null> {
    const terms = options.termsOf(taxonomy)
    if (terms === undefined) return Promise.resolve(null)
    const loaded = terms.then(
      (list): Loaded => ({
        at: now(),
        byId: new Map(list.map((term) => [term.id, term.slug])),
      }),
    )
    // A failed read must not be remembered.
    loaded.catch(() => {
      if (cache.get(taxonomy) === loaded) cache.delete(taxonomy)
    })
    cache.set(taxonomy, loaded)
    return loaded
  }

  async function current(taxonomy: string): Promise<Loaded | null> {
    const held = cache.get(taxonomy)
    const found = held === undefined ? null : await held.catch(() => null)
    if (found !== null && now() - found.at < ttl) return found
    return load(taxonomy)
  }

  return {
    async slug(taxonomy, termId) {
      const first = await current(taxonomy)
      if (first === null) return null
      const known = first.byId.get(termId)
      if (known !== undefined) return known
      if (now() - first.at < missRefresh) return null
      const refreshed = await load(taxonomy)
      return refreshed?.byId.get(termId) ?? null
    },
    invalidate(taxonomy) {
      if (taxonomy === undefined) cache.clear()
      else cache.delete(taxonomy)
    },
  }
}

/**
 * A `TermSlugs` over a fixed list — for a caller that already holds the terms
 * (an import, a test) and wants no cache at all.
 */
export function fixedTermSlugs(
  terms: Readonly<Record<string, Readonly<Record<string, string>>>>,
): TermSlugs {
  return { slug: async (taxonomy, termId) => terms[taxonomy]?.[termId] ?? null }
}
