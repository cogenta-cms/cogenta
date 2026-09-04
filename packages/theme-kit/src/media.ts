import type { ImageOptions, ImageSource, MediaReference, RenderContext } from './contract.js'
import { type HtmlElement, h } from './html.js'

export interface ImageRenderOptions {
  /** The `sizes` hint. Layout knowledge, so it belongs to the theme, not the block. */
  readonly sizes?: string
  /** `eager` only for what is above the fold — the hero, and nothing else. */
  readonly loading?: 'lazy' | 'eager'
  readonly className?: string
  /**
   * An accessible name the *block* provides — a logo's organisation name, for
   * instance. It never invents alt text: it is used only where contract B says
   * the block already carries the name.
   */
  readonly altFrom?: string
  readonly variant?: ImageOptions
}

/**
 * The image (or video) a theme emits — shared so `alt`/`kind` handling cannot
 * drift between theme packages.
 *
 * `alt` is always written, never omitted: an image with no `alt` attribute is
 * announced by its file name, while `alt=""` is announced as decorative. The
 * difference is the whole of WCAG 1.1.1 here, and it cannot be left to whether
 * a caller remembered.
 *
 * The alt text itself comes from the media entity through `ctx.image` — a
 * theme has no business inventing one, and correcting it in the media library
 * must fix every page at once.
 *
 * `kind: 'video'` (contract D `theme@1.1`) renders a `<video>` with its
 * poster instead of a broken `<img>` — the gap the very first theme built
 * against the pre-1.1 copy of this contract had, closed here once for every
 * theme rather than per theme.
 */
export function image(
  ctx: RenderContext,
  media: MediaReference,
  options: ImageRenderOptions = {},
): HtmlElement {
  return renderImageSource(ctx.image(media, options.variant), options)
}

/**
 * The same markup `image()` builds, from a source already resolved (by
 * `entryImage`, say) rather than a raw `MediaReference` — for a caller that
 * has an `ImageSource` in hand and no `RenderContext.image` to call again
 * (`renderEntryHeader`'s cover, contract D `theme@1.4`).
 */
export function renderImageSource(
  source: ImageSource,
  options: Omit<ImageRenderOptions, 'variant'> = {},
): HtmlElement {
  if (source.kind === 'video') {
    return h('video', {
      class: options.className,
      src: source.src,
      poster: source.poster,
      width: source.width,
      height: source.height,
      controls: true,
      preload: 'metadata',
      style:
        source.focal === null
          ? undefined
          : `object-position:${source.focal.x * 100}% ${source.focal.y * 100}%`,
    })
  }
  return h('img', {
    class: options.className,
    src: source.src,
    srcset: source.srcset === '' ? undefined : source.srcset,
    sizes: options.sizes,
    width: source.width,
    height: source.height,
    alt: source.alt !== '' ? source.alt : (options.altFrom ?? ''),
    loading: options.loading ?? 'lazy',
    decoding: 'async',
    // The focal point is content data, not a style value: it says which part of
    // the picture must survive a crop. Nothing else can carry it per-image.
    style:
      source.focal === null
        ? undefined
        : `object-position:${source.focal.x * 100}% ${source.focal.y * 100}%`,
  })
}

/** Contract B's framing values, as a CSS `aspect-ratio`. `original` means none. */
export function aspectRatio(ratio: string | undefined): string | undefined {
  if (ratio === undefined || ratio === 'original') return undefined
  const [width, height] = ratio.split(':')
  if (width === undefined || height === undefined) return undefined
  return `${width} / ${height}`
}
