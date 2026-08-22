/**
 * Contract D, transcribed once for every theme package to implement against.
 *
 * `ThemeManifest`/`defineTheme`/`SkinTokens` are `@cogenta/render`'s own,
 * already-validated definitions (`theme/manifest.ts`, `skin/tokens.ts`) —
 * re-exported here rather than duplicated, since `@cogenta/render` is also
 * what `loadTheme`/`verifyTheme`/the plugin theme marketplace already check
 * a manifest against. A second, drifting copy of either is exactly the
 * mistake this package exists to stop repeating.
 *
 * `RenderContext`/`ContentEntry`/`ContentClient`/`QueryRequest`/`Page` below
 * are declared fresh here rather than imported from `@cogenta/render`: that
 * package's own `context/types.ts` shapes a *different*, still-unused
 * pipeline (the deferred Astro static build, `astro/integration.ts`) whose
 * `ContentEntry` nests fields under `.values` and whose `MediaReference` is a
 * full asset object — incompatible with the flat, string-keyed contract
 * `cogenta serve`'s real, tested SSR path has used since L3 and every theme
 * (including this repository's own reference theme) is built against.
 * Unifying onto the Astro shape would change live, working behaviour for a
 * pipeline nothing serves through yet — this contract is the one actually in
 * production, transcribed rather than guessed at.
 *
 * `ImageOptions`/`ImageSource` *are* taken from `@cogenta/render` — those two
 * are genuinely the same contract on both pipelines (`describeMedia`, which
 * `cogenta serve` already calls, returns exactly this shape), and reusing
 * them picks up `kind`/`poster` (`theme@1.1`): the fix that lets a theme tell
 * a video apart from a broken image, which the very first theme built against
 * the pre-1.1 copy of this contract could not.
 */

import type { ImageOptions, ImageSource } from '@cogenta/render'

export type {
  ImageOptions,
  ImageSource,
  SkinTokens,
  ThemeManifest,
  ThemeRuntime,
} from '@cogenta/render'
export { defineTheme } from '@cogenta/render'

/**
 * Contract B stores a media field as the media library's identifier, never as
 * an URL and never as a rendition (`f.media` in `@cogenta/blocks`). So a
 * reference a theme holds is that identifier.
 */
export type MediaReference = string

/**
 * Contract A fixes the system fields but not the schema-defined ones — a
 * theme only ever sees published entries (the read token carries the
 * `public` role), so `status` is narrow in practice but kept whole here
 * rather than guessed at.
 */
export interface ContentEntry {
  readonly id: string
  readonly collection: string
  readonly locale: string
  readonly status: 'draft' | 'scheduled' | 'published' | 'archived'
  readonly [field: string]: unknown
}

export interface QueryRequest {
  readonly collection: string
  readonly filter?: Readonly<Record<string, unknown>>
  readonly sort?: { readonly field: string; readonly direction: 'asc' | 'desc' }
  readonly limit?: number
  readonly cursor?: string
}

export interface Page<T> {
  readonly items: readonly T[]
  readonly nextCursor: string | null
}

export interface ContentClient {
  entry(collection: string, id: string): Promise<ContentEntry | null>
  byPath(path: string): Promise<ContentEntry | null>
  list(request: QueryRequest): Promise<Page<ContentEntry>>
}

export type LinkTargetInput = { collection: string; id: string } | { path: string } | string

export interface RenderContext {
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  /** The locale being rendered. */
  readonly locale: string
  /** The URL being rendered, already resolved. */
  readonly url: URL

  /** Translation. An unknown key returns the key, never an empty string. */
  t(key: string, values?: Readonly<Record<string, string | number>>): string

  /** Image variants. Returns what a responsive `<img>` (or `<video>`) needs, nothing more. */
  image(media: MediaReference, options?: ImageOptions): ImageSource

  /** URL of an entry, of a path, or of an external target. Locale-aware. */
  link(target: LinkTargetInput): string

  /** Read-only content access. The only door to data a theme has. */
  readonly content: ContentClient
}
