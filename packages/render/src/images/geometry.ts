import { invalidOptionError } from './errors.js'
import type {
  FocalPoint,
  ImageFit,
  ImageFormat,
  ImageMetadata,
  Rect,
  Size,
  TransformOperation,
} from './types.js'

/**
 * Everything geometric, decided here and only here.
 *
 * Both tiers receive a `TransformOperation` with the crop rectangle and the
 * output size already in pixels. Neither is asked to interpret `cover`, a focal
 * point, or "what should the height be" — those answers must not depend on which
 * codec a host managed to install.
 */

/**
 * The largest side the pipeline will produce.
 *
 * `/_image?w=…` is a public URL: without a ceiling, one request for a 40000px
 * variant is a memory exhaustion, and a loop over widths is a cache-filling
 * attack. 8192 is generous for a 5K display at 2x.
 */
export const MAX_DIMENSION = 8192

export const DEFAULT_QUALITY = 80

export interface VariantRequest {
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly format?: ImageFormat | undefined
  readonly fit?: ImageFit | undefined
  /** From the media entity, never from the theme: contract D is explicit. */
  readonly focal?: FocalPoint | null | undefined
  readonly quality?: number | undefined
}

function assertDimension(value: number, name: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw invalidOptionError(`An image ${name} must be a whole number of pixels, not ${value}.`, {
      [name]: value,
    })
  }
  if (value > MAX_DIMENSION) {
    throw invalidOptionError(
      `An image ${name} of ${value}px is above the ${MAX_DIMENSION}px Cogenta will render.`,
      { [name]: value, max: MAX_DIMENSION },
    )
  }
}

function assertFocal(focal: FocalPoint): void {
  const outside = [focal.x, focal.y].some(
    (value) => !Number.isFinite(value) || value < 0 || value > 1,
  )
  if (outside) {
    throw invalidOptionError(
      `A focal point is expressed as fractions of the image, between 0 and 1 — got (${focal.x}, ${focal.y}).`,
      { focal },
    )
  }
}

function clampQuality(quality: number | undefined): number {
  if (quality === undefined) return DEFAULT_QUALITY
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw invalidOptionError(`An encoder quality must be between 1 and 100, not ${quality}.`, {
      quality,
    })
  }
  return Math.round(quality)
}

const atLeastOne = (value: number): number => Math.max(1, Math.round(value))

/**
 * The crop a `cover` fit implies, centred on the focal point.
 *
 * The focal point is *kept in frame*, not centred: pushing it to the middle
 * would slide the crop off the image for a face near an edge, and clamping the
 * result is what stops that. A missing focal point means the middle, which is
 * what every naive implementation does and what this one falls back to.
 */
export function focalCrop(source: Size, target: Size, focal: FocalPoint | null): Rect {
  const targetRatio = target.width / target.height
  const sourceRatio = source.width / source.height

  const width = sourceRatio > targetRatio ? atLeastOne(source.height * targetRatio) : source.width
  const height = sourceRatio > targetRatio ? source.height : atLeastOne(source.width / targetRatio)

  const cropWidth = Math.min(width, source.width)
  const cropHeight = Math.min(height, source.height)
  const point = focal ?? { x: 0.5, y: 0.5 }

  const clamp = (value: number, span: number, extent: number): number =>
    Math.max(0, Math.min(extent - span, Math.round(value)))

  return {
    left: clamp(point.x * source.width - cropWidth / 2, cropWidth, source.width),
    top: clamp(point.y * source.height - cropHeight / 2, cropHeight, source.height),
    width: cropWidth,
    height: cropHeight,
  }
}

/**
 * Turns a request into an operation, or refuses it.
 *
 * Never upscales. A variant larger than its source costs bytes and buys nothing
 * but blur, and a `srcset` that offers one makes the browser download it.
 */
export function planTransform(source: ImageMetadata, request: VariantRequest): TransformOperation {
  const format = request.format ?? source.format
  const quality = clampQuality(request.quality)
  const focal = request.focal ?? null
  if (focal !== null) assertFocal(focal)

  if (request.width !== undefined) assertDimension(request.width, 'width')
  if (request.height !== undefined) assertDimension(request.height, 'height')

  const identity = { crop: null, resize: null, format, quality } as const
  if (request.width === undefined && request.height === undefined) return identity

  if (request.width !== undefined && request.height !== undefined) {
    if ((request.fit ?? 'cover') === 'contain') {
      // `contain` never crops: the whole image survives, and the caller gets
      // back the size it actually got rather than the box it asked for.
      const scale = Math.min(request.width / source.width, request.height / source.height, 1)
      return withResize(source, scaleOf(source, scale), format, quality)
    }

    const crop = focalCrop(source, { width: request.width, height: request.height }, focal)
    const scale = Math.min(request.width / crop.width, 1)
    const resize = scaleOf(crop, scale)
    const cropIsWhole = crop.width === source.width && crop.height === source.height
    return {
      crop: cropIsWhole ? null : crop,
      resize: resize.width === crop.width && resize.height === crop.height ? null : resize,
      format,
      quality,
    }
  }

  const scale =
    request.width === undefined
      ? Math.min((request.height ?? source.height) / source.height, 1)
      : Math.min(request.width / source.width, 1)
  return withResize(source, scaleOf(source, scale), format, quality)
}

function scaleOf(size: Size, scale: number): Size {
  return { width: atLeastOne(size.width * scale), height: atLeastOne(size.height * scale) }
}

function withResize(
  source: Size,
  resize: Size,
  format: ImageFormat,
  quality: number,
): TransformOperation {
  const unchanged = resize.width === source.width && resize.height === source.height
  return { crop: null, resize: unchanged ? null : resize, format, quality }
}

/** The size the operation produces, without touching a pixel. */
export function outputSize(source: ImageMetadata, operation: TransformOperation): Size {
  if (operation.resize !== null) return operation.resize
  if (operation.crop !== null) return { width: operation.crop.width, height: operation.crop.height }
  return { width: source.width, height: source.height }
}
