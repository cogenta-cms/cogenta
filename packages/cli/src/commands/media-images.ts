import type { ImageSize, MediaImageProcessor, UploadedImageVariant } from '@cogenta/api'
import type { Logger } from '@cogenta/core'
import {
  candidateWidths,
  contentTypeOf,
  createImageRegistry,
  DEFAULT_QUALITY,
  type ImageFormat,
  type ImageTransformer,
  planTransform,
  SRCSET_WIDTHS,
  suffixOf,
} from '@cogenta/render'

/**
 * `@cogenta/render`'s image pipeline, wired to the media upload (L10 task 5).
 *
 * The pipeline, `srcset.ts` and the two driver tiers (sharp, WASM libvips)
 * have existed since L3 and were called by nothing. This module is where they
 * meet a real upload.
 *
 * ## Why variants are produced at upload rather than on demand
 *
 * `createImagePipeline` is deliberately lazy — it renders a variant the first
 * time a browser asks for one — and that is the right design for a build step
 * that would otherwise materialise N formats × M widths × K images. It is the
 * wrong design here, and the lot says so explicitly ("au moment de l'upload,
 * pas à la volée"), for a reason worth writing down: `cogenta serve` has no
 * durable variant cache. `createMemoryVariantStore` dies with the process, so
 * a lazy pipeline behind it re-decodes every image after every restart, and
 * on the shared hosting Cogenta targets (R10's own list) that is the slowest
 * possible answer on the coldest possible machine.
 *
 * Producing a bounded, deterministic set once — the `SRCSET_WIDTHS` ladder,
 * capped at the intrinsic width, in WebP — makes the set nameable, which is
 * what lets `variantNames` clean them up on delete without a `list` call the
 * `StorageDriver` interface does not have.
 *
 * ## Why WebP and not AVIF
 *
 * WebP is universally supported in 2026 and encodes in a fraction of AVIF's
 * time. AVIF's extra compression is real, but paying it per upload on a
 * WASM tier — the tier that always exists (R10) — would make an upload of a
 * handful of images take minutes. A second format can be added the day the
 * pipeline is asked for one, and the ladder is the only thing that has to
 * change.
 */

const VARIANT_FORMAT: ImageFormat = 'webp'

/** The name of one rendition under an asset's variant prefix. */
export function variantName(width: number, format: ImageFormat = VARIANT_FORMAT): string {
  return `${width}.${suffixOf(format)}`
}

/**
 * The widths actually produced for an image.
 *
 * `candidateWidths` caps the ladder at the intrinsic width, so a 500px logo
 * yields 320 and 500 rather than five upscaled copies of itself — upscaling
 * costs bytes and gains nothing.
 */
export function variantWidthsFor(intrinsic: ImageSize): readonly number[] {
  return candidateWidths(intrinsic.width, intrinsic.width, SRCSET_WIDTHS)
}

export interface MediaImageProcessorOptions {
  readonly transformer: ImageTransformer
  readonly quality?: number
}

export function createMediaImageProcessor(
  options: MediaImageProcessorOptions,
): MediaImageProcessor {
  const { transformer } = options
  const quality = options.quality ?? DEFAULT_QUALITY

  return {
    probe: async (bytes) => {
      try {
        const metadata = await transformer.metadata(bytes)
        return { width: metadata.width, height: metadata.height }
      } catch {
        // Not an image this tier can decode. The upload is still legitimate —
        // `verifyRealType` already sniffed the container — so the honest
        // answer is "no dimensions", not a refusal.
        return null
      }
    },

    variants: async (bytes, intrinsic) => {
      const metadata = await transformer.metadata(bytes)
      const produced: UploadedImageVariant[] = []

      for (const width of variantWidthsFor(intrinsic)) {
        const rendered = await transformer.transform(
          bytes,
          planTransform(metadata, { width, format: VARIANT_FORMAT, quality }),
        )
        produced.push({
          name: variantName(width, VARIANT_FORMAT),
          bytes: rendered.bytes,
          contentType: rendered.contentType,
        })
      }

      return produced
    },

    variantNames: (intrinsic) => variantWidthsFor(intrinsic).map((width) => variantName(width)),
  }
}

/**
 * The processor for the driver this host can actually run, or `null`.
 *
 * `null` rather than a throw: an install where neither tier loads must still
 * upload and serve images at their original size. That is the same "absent,
 * not broken" degradation R2 applies to the LLM and R1 to every other driver
 * — a CMS that refuses an upload because a WebAssembly module would not boot
 * is worse than one that serves a full-size JPEG.
 */
export async function selectMediaImageProcessor(
  logger: Logger,
): Promise<{ processor: MediaImageProcessor; driver: string } | null> {
  try {
    const selection = await createImageRegistry({ logger }).select({})
    return {
      processor: createMediaImageProcessor({ transformer: selection.instance }),
      driver: selection.driver,
    }
  } catch (error) {
    logger.warn('no image driver available; uploads will carry no variants', {
      error: String(error),
    })
    return null
  }
}

export { contentTypeOf, VARIANT_FORMAT }
