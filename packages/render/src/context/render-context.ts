import { CogentaError } from '@cogenta/core'
import type { SiteConfig } from '../config.js'
import type { ContentClient, MediaReference } from '../content/types.js'
import type { ImageOptions, ImageSource, LinkTarget, RenderContext } from './types.js'

/**
 * Builds the object a theme receives, and nothing the theme did not ask for.
 *
 * Every capability is a function the host supplies. That is what keeps the
 * context honest: `link` cannot read the routing table because it is handed a
 * resolver, and `image` cannot open a file because it only ever builds a URL.
 */

/** Messages per locale, then per key. Flat keys: `nav.home`, not nested objects. */
export type Messages = Readonly<Record<string, Readonly<Record<string, string>>>>

export interface RenderContextOptions {
  readonly site: SiteConfig
  readonly locale: string
  readonly url: URL | string
  readonly content: ContentClient
  readonly messages?: Messages | undefined
  /**
   * Path of an entry, without the locale prefix, or null when the entry has no
   * route. Supplied by the routing layer; the theme never sees it.
   */
  readonly resolveEntryPath?:
    | ((target: { collection: string; id: string }) => string | null)
    | undefined
  /** Where image variants are served from. */
  readonly imageEndpoint?: string | undefined
}

/** Widths a responsive image is offered in. Fixed, so that variants stay countable. */
const SRCSET_WIDTHS = [320, 640, 960, 1280, 1920] as const
const DEFAULT_IMAGE_ENDPOINT = '/_image'

export function createRenderContext(options: RenderContextOptions): RenderContext {
  const site = options.site
  const locale = options.locale
  const url = typeof options.url === 'string' ? new URL(options.url, site.url) : options.url
  const messages = options.messages ?? {}
  const imageEndpoint = options.imageEndpoint ?? DEFAULT_IMAGE_ENDPOINT

  if (!site.locales.includes(locale)) {
    throw new CogentaError({
      code: 'CONFIG_INVALID',
      message: `Cannot render locale "${locale}": the site declares ${site.locales.join(', ')}.`,
      hint: 'Add the locale to site.locales, or render one the site knows about.',
      details: { locale, locales: site.locales },
    })
  }

  return {
    site: {
      name: site.name,
      url: site.url,
      locales: site.locales,
      defaultLocale: site.defaultLocale,
    },
    locale,
    url,
    content: options.content,

    t(key, values) {
      const template = messages[locale]?.[key] ?? messages[site.defaultLocale]?.[key] ?? key
      return values === undefined ? template : interpolate(template, values)
    },

    image(media, imageOptions) {
      return buildImageSource(imageEndpoint, media, imageOptions ?? {})
    },

    link(target) {
      return resolveLink(target, {
        locale,
        defaultLocale: site.defaultLocale,
        resolveEntryPath: options.resolveEntryPath,
      })
    },
  }
}

/** `{name}` only. A template language in a theme string is a template language to secure. */
function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

interface LinkResolution {
  readonly locale: string
  readonly defaultLocale: string
  readonly resolveEntryPath?:
    | ((target: { collection: string; id: string }) => string | null)
    | undefined
}

function resolveLink(target: LinkTarget, resolution: LinkResolution): string {
  if (typeof target === 'string') {
    // An absolute or protocol-relative target is left exactly as written: it
    // leaves the site, so localising it would be wrong.
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/iu.test(target)) return target
    return localise(target, resolution)
  }

  if ('path' in target) return localise(target.path, resolution)

  const resolve = resolution.resolveEntryPath
  if (resolve === undefined) {
    throw new CogentaError({
      code: 'CONTENT_ROUTE_INVALID',
      message: `This render context cannot resolve the URL of ${target.collection}/${target.id}.`,
      hint: 'The host must supply resolveEntryPath when a theme links to entries.',
      details: { collection: target.collection, id: target.id },
    })
  }

  const path = resolve(target)
  if (path === null) {
    // A dangling internal link is a content problem the site owner can fix,
    // and contract A wants it detectable. Emitting `#` instead would ship a
    // broken page that nobody notices.
    throw new CogentaError({
      code: 'CONTENT_NOT_FOUND',
      message: `Nothing to link to: ${target.collection}/${target.id} has no route.`,
      hint: 'The entry was deleted, is not published in this locale, or its collection has no routing pattern.',
      details: { collection: target.collection, id: target.id },
    })
  }

  return localise(path, resolution)
}

/** The default locale owns the bare path; every other locale is prefixed. */
function localise(path: string, resolution: LinkResolution): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (resolution.locale === resolution.defaultLocale) return clean
  return clean === '/' ? `/${resolution.locale}` : `/${resolution.locale}${clean}`
}

function buildImageSource(
  endpoint: string,
  media: MediaReference,
  options: ImageOptions,
): ImageSource {
  const width = options.width ?? media.width
  if (width === undefined) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `The media ${media.id} has no width, and none was asked for.`,
      hint: 'Pass a width to ctx.image(), or re-scan the media so that its intrinsic size is stored. A width is required: an image without one shifts the layout while it loads.',
      details: { media: media.id },
    })
  }

  const height = options.height ?? scaledHeight(media, width)
  const candidates = SRCSET_WIDTHS.filter(
    (candidate) => media.width === undefined || candidate <= media.width,
  )
  const widths = [...new Set([...candidates, width])].sort((a, b) => a - b)

  // A video is not resized and has no responsive source set: `kind` is what
  // lets a theme render <video> instead of a broken <img> (contract D,
  // theme@1.1). Without it every video in a hero renders as a broken image.
  const kind = media.kind === 'video' ? 'video' : 'image'

  if (kind === 'video') {
    return {
      kind,
      src: variantUrl(endpoint, media, width, options),
      srcset: '',
      width,
      height,
      alt: media.alt ?? '',
      focal: media.focal ?? null,
      ...(media.poster === undefined ? {} : { poster: media.poster }),
    }
  }

  return {
    kind,
    src: variantUrl(endpoint, media, width, options),
    srcset: widths.map((w) => `${variantUrl(endpoint, media, w, options)} ${w}w`).join(', '),
    width,
    height,
    alt: media.alt ?? '',
    focal: media.focal ?? null,
  }
}

function scaledHeight(media: MediaReference, width: number): number {
  if (media.width === undefined || media.height === undefined || media.width === 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `The media ${media.id} has no intrinsic size, so no height can be derived.`,
      hint: 'Pass width and height to ctx.image(), or re-scan the media so that its size is stored.',
      details: { media: media.id },
    })
  }
  return Math.round((media.height / media.width) * width)
}

function variantUrl(
  endpoint: string,
  media: MediaReference,
  width: number,
  options: ImageOptions,
): string {
  const parameters = new URLSearchParams({ id: media.id, w: String(width) })
  if (options.height !== undefined) parameters.set('h', String(options.height))
  if (options.format !== undefined) parameters.set('f', options.format)
  if (options.fit !== undefined) parameters.set('fit', options.fit)
  return `${endpoint}?${parameters.toString()}`
}
