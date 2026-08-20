import type { DriverTier } from '@cogenta/core'

/**
 * The image pipeline, as a Cogenta driver.
 *
 * One interface, an optimal tier (`sharp`, native libvips) and a degraded tier
 * (WebAssembly libvips), and a single contract suite played against both — the
 * shape rule R1 asks of every infrastructure need. `sharp` is the fastest thing
 * available on a machine that can install it, and it cannot be installed on a
 * good number of the machines Cogenta targets: ARM, musl, shared hosting. Rule
 * R10 is explicit about it, so the native tier is an *optional* peer and the
 * WASM tier is the one that always exists.
 *
 * What a driver does is deliberately small: decode a header, and execute a
 * transform that has **already been decided**. Every geometric decision — which
 * crop rectangle a focal point implies, which widths a `srcset` offers, whether
 * a request would upscale — lives in `geometry.ts` and `srcset.ts`, shared by
 * both tiers. That is what makes "the same image, on any host, byte-for-byte
 * comparable output" achievable: the two tiers cannot disagree about geometry
 * because only one of them computes it.
 */

/** Output formats contract D allows a theme to ask for. */
export const IMAGE_FORMATS = ['avif', 'webp', 'jpeg', 'png'] as const

export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export type ImageFit = 'cover' | 'contain'

/** Normalised coordinates, `0..1`, of the point a crop must keep in frame. */
export interface FocalPoint {
  readonly x: number
  readonly y: number
}

/** Contract D — `ImageOptions`, frozen at `theme@1.1`. */
export interface ImageOptions {
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly format?: ImageFormat | undefined
  readonly fit?: ImageFit | undefined
}

/** Contract D — `ImageSource`, frozen at `theme@1.1`. */
export interface ImageSource {
  /**
   * What this media actually is. `hero.media` and `mediaFigure.media` accept an
   * image **or** a video (contract B), and a theme that cannot tell them apart
   * renders every video as a broken `<img>`.
   */
  readonly kind: 'image' | 'video'
  readonly src: string
  /** Empty for a video: there is no responsive source set to offer. */
  readonly srcset: string
  readonly width: number
  readonly height: number
  /** Alt text and focal point come from the media entity, never invented here. */
  readonly alt: string
  readonly focal: FocalPoint | null
  /** Video only: the still shown before playback. */
  readonly poster?: string
}

/**
 * A media entity as the delivery plane sees it.
 *
 * A superset of `MediaReference` with the two fields a video needs. It is
 * declared here rather than imported for the reason ADR-0016 gives about every
 * other wire type: what crosses the boundary is JSON, and the pipeline must not
 * be able to reach the content engine's declarations.
 */
export interface MediaAsset {
  readonly id: string
  readonly kind: 'image' | 'video'
  readonly alt?: string | undefined
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly focal?: FocalPoint | null | undefined
  /** Delivery URL of the original. Absent means "derive it from the id". */
  readonly url?: string | undefined
  /** Video only: the still shown before playback. */
  readonly poster?: string | undefined
  /**
   * A short, stable digest of the current bytes (fiche 11 task 4). Folded
   * into every `/_image` URL as `&v=` when present. `/_image?id=…` is
   * otherwise a stable URL under a year-long `Cache-Control: immutable`
   * (L10 task 5) — replacing the original in place (`MediaStore.replace`)
   * changes nothing a visitor's browser already cached until the URL itself
   * changes too. Absent is fully backward compatible: no `&v=` is added,
   * exactly today's behaviour. Added in `theme@1.2`.
   */
  readonly version?: string | undefined
}

export interface Size {
  readonly width: number
  readonly height: number
}

/** A rectangle in **source** pixels. */
export interface Rect extends Size {
  readonly left: number
  readonly top: number
}

/**
 * A fully decided transform. Crop first, then resize, then encode — in that
 * order, on every tier. No option here is a hint: a driver that reinterprets one
 * makes the two tiers disagree.
 */
export interface TransformOperation {
  readonly crop: Rect | null
  readonly resize: Size | null
  readonly format: ImageFormat
  /** `1..100`. Ignored by `png`, which is lossless. */
  readonly quality: number
}

export interface ImageMetadata {
  readonly width: number
  readonly height: number
  readonly format: ImageFormat
}

export interface RenderedVariant {
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
  readonly format: ImageFormat
  /** Ready to serve as `Content-Type`. */
  readonly contentType: string
}

/**
 * One implementation of the pipeline. Stateless between calls, so that a
 * selection can be shared by every request without a lock.
 */
export interface ImageTransformer {
  readonly name: string
  readonly tier: DriverTier
  /** Intrinsic size and container format. Must not decode the pixels. */
  metadata(bytes: Uint8Array): Promise<ImageMetadata>
  transform(bytes: Uint8Array, operation: TransformOperation): Promise<RenderedVariant>
  dispose(): Promise<void>
}

/** The resolved `images` section of the configuration. */
export interface ImageConfig {
  readonly driver?: string
  /** Default encoder quality, `1..100`. */
  readonly quality?: number
}
