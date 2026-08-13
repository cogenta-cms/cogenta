import { invalidOptionError } from './errors.js'
import { DEFAULT_QUALITY, planTransform, type VariantRequest } from './geometry.js'
import { describeMedia, type SourceOptions } from './srcset.js'
import { createMemoryVariantStore, type VariantStore } from './store.js'
import {
  type FocalPoint,
  IMAGE_FORMATS,
  type ImageFit,
  type ImageFormat,
  type ImageOptions,
  type ImageSource,
  type ImageTransformer,
  type MediaAsset,
  type RenderedVariant,
} from './types.js'

/**
 * The lazy half of the pipeline.
 *
 * `source()` does no work at all — it returns URLs — and `variant()` does the
 * work the first time a browser follows one of them. That split is the answer to
 * the spec's warning: nothing is generated at build time, so a site with ten
 * thousand images and five widths does not have fifty thousand files to produce
 * before it can deploy. What it has is a cache that fills with the variants
 * someone actually looked at.
 */

export interface VariantParameters {
  readonly id: string
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly format?: ImageFormat | undefined
  readonly fit?: ImageFit | undefined
  /**
   * From the media entity, resolved by the caller. It is not a URL parameter:
   * see the note in `srcset.ts`.
   */
  readonly focal?: FocalPoint | null | undefined
}

export interface ImagePipelineOptions {
  readonly transformer: ImageTransformer
  /** Reads the original bytes. The pipeline never touches storage itself. */
  readonly load: (id: string) => Promise<Uint8Array>
  readonly store?: VariantStore | undefined
  readonly source?: SourceOptions | undefined
  readonly quality?: number | undefined
}

export interface ImagePipeline {
  readonly driver: string
  /** Contract D's `ctx.image()`. Pure: builds URLs, generates nothing. */
  source(media: MediaAsset, options?: ImageOptions): ImageSource
  /** What `/_image` calls. Generates on first ask, then serves from the store. */
  variant(parameters: VariantParameters): Promise<RenderedVariant>
}

export function variantKey(parameters: VariantParameters, quality: number): string {
  const focal = parameters.focal
  return [
    parameters.id,
    `w=${parameters.width ?? ''}`,
    `h=${parameters.height ?? ''}`,
    `f=${parameters.format ?? ''}`,
    `fit=${parameters.fit ?? ''}`,
    `q=${quality}`,
    `focal=${focal === undefined || focal === null ? '' : `${focal.x},${focal.y}`}`,
  ].join('|')
}

export function createImagePipeline(options: ImagePipelineOptions): ImagePipeline {
  const store = options.store ?? createMemoryVariantStore()
  const quality = options.quality ?? DEFAULT_QUALITY
  const sourceOptions = options.source ?? {}
  const { transformer } = options

  /**
   * Requests for a variant that is being generated right now.
   *
   * Without this, a page with one hero image and twenty simultaneous visitors
   * decodes that image twenty times. It is the difference between a cold cache
   * costing one render and costing as many renders as there are readers.
   */
  const inFlight = new Map<string, Promise<RenderedVariant>>()

  async function generate(key: string, parameters: VariantParameters): Promise<RenderedVariant> {
    const bytes = await options.load(parameters.id)
    const metadata = await transformer.metadata(bytes)

    const request: VariantRequest = {
      width: parameters.width,
      height: parameters.height,
      format: parameters.format,
      fit: parameters.fit,
      focal: parameters.focal,
      quality,
    }
    const variant = await transformer.transform(bytes, planTransform(metadata, request))
    await store.set(key, variant)
    return variant
  }

  return {
    driver: transformer.name,

    source: (media, imageOptions) => describeMedia(media, imageOptions ?? {}, sourceOptions),

    variant: async (parameters) => {
      const key = variantKey(parameters, quality)

      const cached = await store.get(key)
      if (cached !== null) return cached

      const running = inFlight.get(key)
      if (running !== undefined) return running

      const work = generate(key, parameters).finally(() => {
        inFlight.delete(key)
      })
      inFlight.set(key, work)
      return work
    },
  }
}

/**
 * The query string of `/_image`, turned into parameters, or refused.
 *
 * Kept next to `variantUrl` in spirit: one function writes the URL, this one
 * reads it, and a public URL is untrusted input like any other — `w=1e9` and
 * `f=../../etc/passwd` arrive here, not at a decoder.
 */
export function parseVariantParameters(query: URLSearchParams): VariantParameters {
  const id = query.get('id')
  if (id === null || id === '') {
    throw invalidOptionError('An image request must name the media it wants.', { query: 'id' })
  }

  const format = query.get('f')
  if (format !== null && !IMAGE_FORMATS.includes(format as ImageFormat)) {
    throw invalidOptionError(`"${format}" is not a format Cogenta can produce.`, {
      format,
      supported: IMAGE_FORMATS,
    })
  }

  const fit = query.get('fit')
  if (fit !== null && fit !== 'cover' && fit !== 'contain') {
    throw invalidOptionError(`"${fit}" is not an image fit. Use "cover" or "contain".`, { fit })
  }

  return {
    id,
    ...(query.has('w') ? { width: readInteger(query.get('w'), 'w') } : {}),
    ...(query.has('h') ? { height: readInteger(query.get('h'), 'h') } : {}),
    ...(format === null ? {} : { format: format as ImageFormat }),
    ...(fit === null ? {} : { fit }),
  }
}

function readInteger(raw: string | null, name: string): number {
  const value = Number(raw)
  if (raw === null || raw.trim() === '' || !Number.isInteger(value)) {
    throw invalidOptionError(`The "${name}" of an image request must be a whole number.`, {
      [name]: raw,
    })
  }
  return value
}
