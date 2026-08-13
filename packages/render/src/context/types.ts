import type { ContentClient, MediaReference } from '../content/types.js'

/**
 * Contract D's `RenderContext`, frozen at `theme@1.0`.
 *
 * This declaration is the contract, transcribed. Adding an entry is a minor
 * version; changing one is major. Nothing is added here "for later": what a
 * theme can reach is what the sandbox has to defend, so the smallest surface
 * that renders a site is the right one.
 *
 * Notably absent, and absent on purpose: the database, the configuration, the
 * secrets, the filesystem, the logger, the request headers.
 */
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
  link(target: LinkTarget): string

  /** Read-only content access. The only door to data a theme has. */
  readonly content: ContentClient
}

export type LinkTarget = { collection: string; id: string } | { path: string } | string

export interface ImageOptions {
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly format?: 'avif' | 'webp' | 'jpeg' | 'png' | undefined
  readonly fit?: 'cover' | 'contain' | undefined
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
