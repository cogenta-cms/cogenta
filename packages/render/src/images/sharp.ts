import { CogentaError, type Driver, type HealthReport } from '@cogenta/core'
import { decodeFailedError, encodeFailedError, unsupportedFormatError } from './errors.js'
import { contentTypeOf, sniffImageFormat } from './format.js'
import type {
  ImageConfig,
  ImageFormat,
  ImageMetadata,
  ImageTransformer,
  RenderedVariant,
  TransformOperation,
} from './types.js'

/**
 * The optimal tier: `sharp`, which links a native libvips.
 *
 * An **optional peer dependency**, loaded dynamically, and never a hard one.
 * Rule R10 is explicit and the L3 spec repeats it: `sharp` does not install on
 * ARM, on musl, or on shared hosting. Depending on it directly would mean a
 * `pnpm install` that fails on the hosts Cogenta exists to run on, so its
 * absence is a normal outcome here — it is what makes the registry fall through
 * to the WASM tier.
 *
 * Its types are declared structurally rather than imported, so that a site
 * without `sharp` installed can still typecheck against `@cogenta/render`.
 */

interface SharpMetadataLike {
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly hasAlpha?: boolean | undefined
}

interface SharpInstanceLike {
  metadata(): Promise<SharpMetadataLike>
  extract(rect: { left: number; top: number; width: number; height: number }): SharpInstanceLike
  resize(options: { width: number; height: number; fit: 'fill' }): SharpInstanceLike
  flatten(options: { background: string }): SharpInstanceLike
  toFormat(format: string, options?: Readonly<Record<string, unknown>>): SharpInstanceLike
  toBuffer(options: {
    resolveWithObject: true
  }): Promise<{ data: Uint8Array; info: { width: number; height: number } }>
}

type SharpFactory = (input: Uint8Array) => SharpInstanceLike

/**
 * Loads `sharp` if the host application installed it. `null` is a normal
 * answer, not an error.
 */
export async function loadSharpModule(): Promise<SharpFactory | null> {
  try {
    const module = (await import('sharp')) as unknown as { default: SharpFactory }
    return module.default
  } catch {
    return null
  }
}

function encoderOptions(format: ImageFormat, quality: number): Readonly<Record<string, unknown>> {
  return format === 'png' ? { compressionLevel: 9 } : { quality }
}

export function createSharpTransformer(sharp: SharpFactory): ImageTransformer {
  function open(bytes: Uint8Array, mediaId: string): SharpInstanceLike {
    if (sniffImageFormat(bytes) === null) throw unsupportedFormatError(bytes, mediaId)
    return sharp(bytes)
  }

  return {
    name: 'sharp',
    tier: 'optimal',

    metadata: async (bytes: Uint8Array): Promise<ImageMetadata> => {
      const format = sniffImageFormat(bytes)
      if (format === null) throw unsupportedFormatError(bytes, 'this file')

      let described: SharpMetadataLike
      try {
        described = await open(bytes, 'this file').metadata()
      } catch (error) {
        throw decodeFailedError('this file', error)
      }

      const { width, height } = described
      if (width === undefined || height === undefined) {
        throw decodeFailedError('this file', 'sharp reported no intrinsic size')
      }
      return { width, height, format }
    },

    transform: async (
      bytes: Uint8Array,
      operation: TransformOperation,
    ): Promise<RenderedVariant> => {
      let pipeline = open(bytes, 'this file')

      let described: SharpMetadataLike
      try {
        described = await pipeline.metadata()
      } catch (error) {
        throw decodeFailedError('this file', error)
      }

      const { crop, resize } = operation
      if (crop !== null) pipeline = pipeline.extract(crop)
      if (resize !== null) {
        // `fill` on purpose: the crop rectangle already carries the aspect
        // ratio, decided by the shared geometry. Letting sharp fit the box a
        // second time would let the two tiers disagree.
        pipeline = pipeline.resize({ width: resize.width, height: resize.height, fit: 'fill' })
      }
      // JPEG has no alpha. sharp drops the channel silently, which turns a
      // transparent background black; the WASM tier flattens onto white. Doing
      // it explicitly makes both tiers produce the same picture.
      if (operation.format === 'jpeg' && described.hasAlpha === true) {
        pipeline = pipeline.flatten({ background: '#ffffff' })
      }

      try {
        const { data, info } = await pipeline
          .toFormat(operation.format, encoderOptions(operation.format, operation.quality))
          .toBuffer({ resolveWithObject: true })

        return {
          bytes: data,
          width: info.width,
          height: info.height,
          format: operation.format,
          contentType: contentTypeOf(operation.format),
        }
      } catch (error) {
        // A truncated file survives `metadata()` — the header is intact — and
        // fails here, when the pixels are actually read.
        throw isDecodeFailure(error)
          ? decodeFailedError('this file', error)
          : encodeFailedError('this file', operation.format, 'sharp', error)
      }
    },

    dispose: async (): Promise<void> => {
      // sharp holds a process-wide thread pool that other selections share.
    },
  }
}

/** libvips says so in words, and the words are the only signal sharp gives. */
function isDecodeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    message.includes('unsupported image format') ||
    message.includes('input buffer') ||
    message.includes('corrupt') ||
    message.includes('premature') ||
    message.includes('bad seek') ||
    message.includes('truncated') ||
    message.includes('not enough data')
  )
}

export function sharpImageDriver(): Driver<ImageTransformer, ImageConfig> {
  let instance: ImageTransformer | undefined

  return {
    name: 'sharp',
    tier: 'optimal',
    available: async () => (await loadSharpModule()) !== null,
    init: async () => {
      if (instance === undefined) {
        const sharp = await loadSharpModule()
        if (sharp === null) {
          throw new CogentaError({
            code: 'DRIVER_UNAVAILABLE',
            message: 'The sharp image driver was asked for, but sharp is not installed.',
            hint: 'Run `pnpm add sharp`, or leave images.driver on "auto" to use the WebAssembly pipeline, which needs nothing.',
            details: { need: 'images', driver: 'sharp' },
          })
        }
        instance = createSharpTransformer(sharp)
      }
      return instance
    },
    dispose: async () => {
      await instance?.dispose()
      instance = undefined
    },
    health: async (): Promise<HealthReport> => ({
      status: 'ok',
      driver: 'sharp',
      tier: 'optimal',
      message: 'Images are resized by the native libvips behind sharp.',
    }),
  }
}
