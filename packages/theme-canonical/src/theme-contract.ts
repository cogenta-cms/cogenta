/**
 * Contract D — Thème, frozen at `theme@1.0` on 2026-08-13.
 *
 * TEMPORARY HOME. These types and `defineTheme` belong to `@cogenta/render`,
 * which is being written in parallel (tasks 1–3 of L3). They live here so the
 * canonical theme can be written, typechecked and tested today, and must be
 * replaced by an import from `@cogenta/render` at merge time — not duplicated.
 *
 * Nothing below adds to `ctx`. Two shapes the contract names but does not spell
 * out — `MediaReference` and `ContentEntry` — are given the narrowest reading
 * that matches what is already frozen elsewhere; both are flagged in the code.
 */

/**
 * Contract B stores a media field as the media library's identifier, never as
 * an URL and never as a rendition (`f.media` in `@cogenta/blocks`). So a
 * reference the theme can hold is that identifier.
 */
export type MediaReference = string

export interface ImageOptions {
  readonly width?: number
  readonly height?: number
  readonly format?: 'avif' | 'webp' | 'jpeg' | 'png'
  readonly fit?: 'cover' | 'contain'
}

export interface ImageSource {
  readonly src: string
  readonly srcset: string
  readonly width: number
  readonly height: number
  /** Alt text and focal point come from the media entity, never invented here. */
  readonly alt: string
  readonly focal: { readonly x: number; readonly y: number } | null
}

/**
 * Contract A, "Champs système". A theme only ever sees published entries — the
 * read token carries the `public` role — so `status` is narrow in practice but
 * kept whole here rather than guessed at.
 *
 * The schema-defined fields are open: which of them exist depends on the
 * collection, and a theme must not assume one is present. `entryTitle` in
 * `src/render/entry.ts` is the only place that reaches for one.
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

  /** Image variants. Returns what a responsive `<img>` needs, nothing more. */
  image(media: MediaReference, options?: ImageOptions): ImageSource

  /** URL of an entry, of a path, or of an external target. Locale-aware. */
  link(target: LinkTargetInput): string

  /** Read-only content access. The only door to data a theme has. */
  readonly content: ContentClient
}

/** Contract D, "Besoins runtime". */
export type ThemeRuntime = 'static' | 'server' | 'edge'

export interface ThemeManifest {
  readonly name: string
  readonly version: string
  /** Version of the theme contract. */
  readonly engine: string
  /** Version of the block vocabulary supported. */
  readonly blocks: string
  /** Every vocabulary block the theme renders. A gap fails installation. */
  readonly implements: readonly string[]
  /** Content types expected, or `'*'`. */
  readonly collections: readonly string[] | '*'
  readonly runtime: ThemeRuntime
  /** Path to the default skin, relative to the manifest. */
  readonly tokens: string
  readonly a11y: { readonly verified: 'WCAG-2.2-AA' | 'WCAG-2.2-AAA' | 'none' }
}

/**
 * Identity function. It exists for the inference and for the single place a
 * manifest is recognised, not to validate: validation happens at installation,
 * on the theme's sources, where a lie can actually be caught.
 */
export function defineTheme<const M extends ThemeManifest>(manifest: M): M {
  return manifest
}

/**
 * Contract D, "Tokens de skin". The set is **closed and complete**: a skin that
 * omits a token is refused. Rendered as `--cogenta-<group>-<name>` into a single
 * stylesheet, so changing skin rewrites one file and needs no build.
 */
export interface SkinTokens {
  readonly color: {
    readonly bg: string
    readonly fg: string
    readonly accent: string
    readonly accentFg: string
    readonly muted: string
    readonly mutedFg: string
    readonly border: string
  }
  readonly font: {
    readonly sans: string
    readonly serif: string
    readonly mono: string
    readonly scale: number
    readonly baseSize: string
  }
  readonly space: {
    readonly unit: string
    readonly density: 'compact' | 'comfortable' | 'spacious'
  }
  readonly radius: { readonly sm: string; readonly md: string; readonly lg: string }
  readonly motion: { readonly duration: string; readonly easing: string; readonly reduced: boolean }
  readonly shadow: { readonly sm: string; readonly md: string }
}
