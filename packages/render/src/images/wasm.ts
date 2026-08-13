import type { Driver, HealthReport } from '@cogenta/core'
import { decodeFailedError, encodeFailedError, unsupportedFormatError } from './errors.js'
import { contentTypeOf, sniffImageFormat, suffixOf } from './format.js'
import type {
  ImageConfig,
  ImageMetadata,
  ImageTransformer,
  RenderedVariant,
  TransformOperation,
} from './types.js'

/**
 * The degraded tier: libvips compiled to WebAssembly.
 *
 * This is the implementation that must always work, and the reason the pipeline
 * has two tiers at all. `sharp` links a native libvips, and rule R10 names the
 * hosts where that does not install — ARM, musl, shared hosting. A CMS whose
 * images stop working on those hosts is not a CMS that runs anywhere, so the
 * WASM tier is a plain dependency while the native one is an optional peer.
 *
 * It is slower — roughly a small multiple of native for a typical variant — and
 * that is an acceptable price for something that runs once per variant and is
 * then cached forever.
 *
 * Its types are declared structurally rather than imported, exactly as the Redis
 * cache driver does: a 12 MB WebAssembly package has no business appearing in
 * the published type declarations of `@cogenta/render`.
 */

interface VipsImageLike {
  readonly width: number
  readonly height: number
  hasAlpha(): boolean
  crop(left: number, top: number, width: number, height: number): VipsImageLike
  resize(scale: number, options?: { vscale?: number }): VipsImageLike
  flatten(options?: { background?: readonly number[] }): VipsImageLike
  writeToBuffer(suffix: string, options?: Readonly<Record<string, unknown>>): Uint8Array
  delete(): void
}

interface VipsLike {
  readonly Image: {
    newFromBuffer(data: Uint8Array): VipsImageLike
  }
}

type VipsFactory = (config?: Readonly<Record<string, unknown>>) => Promise<VipsLike>

/**
 * One libvips instance for the process.
 *
 * Booting the WebAssembly module costs about a second, and it is stateless once
 * up. Paying that per request would make the first render of every page slow
 * enough to look broken.
 */
let booting: Promise<VipsLike> | undefined

export async function loadVips(): Promise<VipsLike> {
  booting ??= (async () => {
    const module = (await import('wasm-vips')) as unknown as { default: VipsFactory }
    // Silenced on purpose: libvips writes warnings to stdout, and rule "no
    // console" applies to what a dependency prints through us as much as to
    // what we print ourselves.
    return module.default({ print: () => {}, printErr: () => {} })
  })()
  return booting
}

/** Encoder options per format. `Q` means nothing to a lossless PNG. */
function encoderOptions(format: string, quality: number): Readonly<Record<string, unknown>> {
  return format === 'png' ? { compression: 9 } : { Q: quality }
}

export function createWasmTransformer(vips: VipsLike): ImageTransformer {
  function load(bytes: Uint8Array, mediaId: string): VipsImageLike {
    if (sniffImageFormat(bytes) === null) throw unsupportedFormatError(bytes, mediaId)
    try {
      return vips.Image.newFromBuffer(bytes)
    } catch (error) {
      // libvips reports a bad file as a WebAssembly exception, which is not an
      // Error and would cross the whole call stack unrecognised.
      throw decodeFailedError(mediaId, error)
    }
  }

  return {
    name: 'wasm',
    tier: 'degraded',

    metadata: async (bytes: Uint8Array): Promise<ImageMetadata> => {
      const format = sniffImageFormat(bytes)
      if (format === null) throw unsupportedFormatError(bytes, 'this file')
      const image = load(bytes, 'this file')
      try {
        return { width: image.width, height: image.height, format }
      } finally {
        image.delete()
      }
    },

    transform: async (
      bytes: Uint8Array,
      operation: TransformOperation,
    ): Promise<RenderedVariant> => {
      const handles: VipsImageLike[] = []
      const keep = (image: VipsImageLike): VipsImageLike => {
        handles.push(image)
        return image
      }

      try {
        let image = keep(load(bytes, 'this file'))
        const { crop, resize } = operation
        if (crop !== null) image = keep(image.crop(crop.left, crop.top, crop.width, crop.height))
        if (resize !== null) {
          image = keep(
            image.resize(resize.width / image.width, { vscale: resize.height / image.height }),
          )
        }
        // JPEG has no alpha channel. libvips refuses the write rather than
        // guessing a background, so the guess is made here, once, and the same
        // way the native tier makes it.
        if (operation.format === 'jpeg' && image.hasAlpha()) {
          image = keep(image.flatten({ background: [255, 255, 255] }))
        }

        // The dimensions reported are the ones libvips actually produced, not
        // the ones the plan asked for. They agree, and saying so from the
        // handle is what lets the contract suite prove it on both tiers.
        const size = { width: image.width, height: image.height }
        try {
          const written = image.writeToBuffer(
            suffixOf(operation.format),
            encoderOptions(operation.format, operation.quality),
          )
          return {
            // Copied out of the WebAssembly heap: the view libvips returns
            // points into memory it is free to reuse.
            bytes: Uint8Array.from(written),
            width: size.width,
            height: size.height,
            format: operation.format,
            contentType: contentTypeOf(operation.format),
          }
        } catch (error) {
          throw encodeFailedError('this file', operation.format, 'wasm', error)
        }
      } finally {
        for (const handle of handles) handle.delete()
      }
    },

    dispose: async (): Promise<void> => {
      // Nothing to release: the libvips instance is process-wide and shared by
      // every selection, so disposing one caller must not take it down.
    },
  }
}

export function wasmImageDriver(): Driver<ImageTransformer, ImageConfig> {
  let instance: ImageTransformer | undefined

  return {
    name: 'wasm',
    tier: 'degraded',
    // Always true, and that is the point of this driver: it is what rule R1
    // means by "at least one implementation with no external service".
    available: async () => true,
    init: async () => {
      instance ??= createWasmTransformer(await loadVips())
      return instance
    },
    dispose: async () => {
      await instance?.dispose()
      instance = undefined
    },
    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'wasm',
      tier: 'degraded',
      message:
        'Images are resized by libvips compiled to WebAssembly. Correct everywhere, several times slower than sharp. Install sharp for the native path.',
    }),
  }
}
