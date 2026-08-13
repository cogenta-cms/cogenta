import { missingSizeError } from './errors.js'
import type { ImageOptions, ImageSource, MediaAsset } from './types.js'

/**
 * What `ctx.image()` returns, and it returns it **without generating anything**.
 *
 * The spec's warning is the whole design here: variants are N formats × M widths
 * × K contents, and a build that materialises that product does not finish. So a
 * theme only ever gets URLs, and a variant is rendered the first time a browser
 * asks for it — then cached. A page that nobody visits costs nothing.
 *
 * The widths are a fixed ladder rather than anything derived from the request,
 * for the same reason: a countable set of variants can be cached, warmed and
 * purged, and an open-ended one cannot.
 */
export const SRCSET_WIDTHS: readonly number[] = [320, 640, 960, 1280, 1920]

export interface SourceOptions {
  /** Where image variants are served from. */
  readonly endpoint?: string | undefined
  /** Where originals are served from — videos, and anything not resized. */
  readonly mediaEndpoint?: string | undefined
  readonly widths?: readonly number[] | undefined
}

const DEFAULT_ENDPOINT = '/_image'
const DEFAULT_MEDIA_ENDPOINT = '/_media'

function originalUrl(media: MediaAsset, mediaEndpoint: string): string {
  return media.url ?? `${mediaEndpoint}/${encodeURIComponent(media.id)}`
}

export function variantUrl(
  endpoint: string,
  media: MediaAsset,
  width: number,
  options: ImageOptions,
): string {
  const parameters = new URLSearchParams({ id: media.id, w: String(width) })
  if (options.height !== undefined) parameters.set('h', String(options.height))
  if (options.format !== undefined) parameters.set('f', options.format)
  if (options.fit !== undefined) parameters.set('fit', options.fit)
  // The focal point is deliberately absent: the endpoint reads it from the media
  // entity. Putting it in the URL would let a visitor choose the crop, and would
  // multiply the cache keys of every image by the number of points someone
  // cares to try.
  return `${endpoint}?${parameters.toString()}`
}

/** The ladder, capped at the intrinsic width, with the asked-for width always in it. */
export function candidateWidths(
  requested: number,
  intrinsic: number | undefined,
  ladder: readonly number[] = SRCSET_WIDTHS,
): readonly number[] {
  const ceiling = intrinsic ?? requested
  const offered = ladder.filter((width) => width <= ceiling)
  return [...new Set([...offered, Math.min(requested, ceiling)])].sort((a, b) => a - b)
}

/**
 * Contract D's `ImageSource` for one media entity.
 *
 * A video is not resized. It returns `kind: 'video'`, an empty `srcset` — there
 * is no responsive source set to offer for a video element — and its poster if
 * the media has one.
 */
export function describeMedia(
  media: MediaAsset,
  options: ImageOptions = {},
  config: SourceOptions = {},
): ImageSource {
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT
  const mediaEndpoint = config.mediaEndpoint ?? DEFAULT_MEDIA_ENDPOINT
  const { width, height } = declaredSize(media, options)

  if (media.kind === 'video') {
    const poster = media.poster
    return {
      kind: 'video',
      src: originalUrl(media, mediaEndpoint),
      srcset: '',
      width,
      height,
      alt: media.alt ?? '',
      focal: media.focal ?? null,
      ...(poster === undefined ? {} : { poster }),
    }
  }

  const widths = candidateWidths(width, media.width, config.widths ?? SRCSET_WIDTHS)

  return {
    kind: 'image',
    src: variantUrl(endpoint, media, width, options),
    srcset: widths.map((w) => `${variantUrl(endpoint, media, w, options)} ${w}w`).join(', '),
    width,
    height,
    alt: media.alt ?? '',
    focal: media.focal ?? null,
  }
}

/**
 * The size the `<img>` or `<video>` declares, which is what reserves the space
 * before the file arrives. Refusing to guess is the point: a missing size is a
 * layout shift, and a layout shift is a Lighthouse failure the site owner cannot
 * diagnose from the rendered page.
 */
function declaredSize(media: MediaAsset, options: ImageOptions): { width: number; height: number } {
  const width = options.width ?? media.width
  const height =
    options.height ??
    (width !== undefined &&
    media.width !== undefined &&
    media.height !== undefined &&
    media.width > 0
      ? Math.round((media.height / media.width) * width)
      : media.height)

  if (width === undefined || height === undefined) throw missingSizeError(media.id)
  return { width, height }
}
