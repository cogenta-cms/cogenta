/**
 * Contract D — Thème (`theme@1.1`, `docs/04-contrats.md`), copied here on
 * purpose rather than imported from `@cogenta/render`.
 *
 * A real third-party theme has no reason to depend on `@cogenta/render` at
 * runtime: that package also carries build tooling, drivers and
 * `@cogenta/core` — exactly the kind of thing contract D's own installation
 * check refuses a theme for importing (`node:fs`, `@cogenta/core`,
 * `@cogenta/schema`, any driver package). `packages/theme-canonical` (the
 * reference theme shipped with Cogenta itself) makes the same choice for the
 * same reason — this file mirrors its shape so a theme built from this
 * starter behaves like the one Cogenta ships, not like a special case.
 *
 * `defineTheme` is an identity function on purpose: it exists for type
 * inference, not validation. A theme is validated at install time, against
 * its real source files — that's `inspectTheme`/`verifyTheme` in
 * `@cogenta/render`, exercised for this starter itself in `test/verify.test.ts`.
 */

export interface ImageOptions {
  readonly width?: number
  readonly height?: number
  readonly format?: 'avif' | 'webp' | 'jpeg' | 'png'
  readonly fit?: 'cover' | 'contain'
}

/** `kind`/`poster` (added in `theme@1.1`) are what let a theme tell a video from an image rather than rendering a broken `<img>`. */
export interface ImageSource {
  readonly kind: 'image' | 'video'
  readonly src: string
  readonly srcset: string
  readonly width: number
  readonly height: number
  readonly alt: string
  readonly focal: { readonly x: number; readonly y: number } | null
  readonly poster?: string
}

/** A media field stores the media library's identifier (contract B), never a URL. */
export interface MediaReference {
  readonly id: string
  readonly kind: 'image' | 'video'
  readonly alt?: string
  readonly width?: number
  readonly height?: number
  readonly focal?: { readonly x: number; readonly y: number } | null
  readonly poster?: string
}

export interface ContentEntry {
  readonly id: string
  readonly locale: string
  readonly status: 'published'
  readonly createdAt: string
  readonly updatedAt: string
  readonly publishedAt: string | null
  readonly provenance: 'human' | 'assisted' | 'generated'
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: Readonly<Record<string, readonly unknown[]>>
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

export type LinkTarget = { collection: string; id: string } | { path: string } | string

export interface RenderContext {
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly locale: string
  readonly url: URL
  t(key: string, values?: Readonly<Record<string, string | number>>): string
  image(media: MediaReference, options?: ImageOptions): ImageSource
  link(target: LinkTarget): string
  readonly content: ContentClient
}

export type ThemeRuntime = 'static' | 'server' | 'edge'

export interface ThemeManifest {
  readonly name: string
  readonly version: string
  readonly engine: string
  readonly blocks: string
  readonly implements: readonly string[]
  readonly collections: readonly string[] | '*'
  readonly runtime: ThemeRuntime
  readonly tokens: string
  readonly a11y?: { readonly verified: string }
}

export function defineTheme<const M extends ThemeManifest>(manifest: M): M {
  return manifest
}
