/**
 * L18 task 4 — the image provider abstraction.
 *
 * Shaped exactly like `ProviderClient` (L4) and for the same stated reason:
 * "un fournisseur d'image (driver, comme les fournisseurs LLM existants —
 * plusieurs implémentations, jamais un seul fournisseur en dur)". Vendors
 * disagree on nearly everything above the wire — OpenAI returns
 * `data[].b64_json`, Stability returns `artifacts[].base64`, sizes are a
 * `"1024x1024"` string in one and a width/height pair in the other — and this
 * interface is the one place that difference is allowed to live.
 *
 * Unlike cache or storage there is **no degraded tier**, and there deliberately
 * is no `Driver`/registry-with-fallback here: there is no local, service-free
 * way to draw a picture from a sentence, so the honest degradation is that the
 * feature is absent, not that it is slower. `createImageProviderRegistry`
 * returns an empty registry for a site that configured none, and the tool is
 * never built.
 */

/** Deliberately a small closed set: every vendor supports these three shapes. */
export const IMAGE_SIZES = ['square', 'landscape', 'portrait'] as const
export type ImageSize = (typeof IMAGE_SIZES)[number]

export interface ImageRequest {
  readonly prompt: string
  readonly size?: ImageSize
  /** How many candidates to produce. Vendors cap this; adapters clamp rather than fail. */
  readonly count?: number
}

export interface GeneratedImage {
  /** `image/png` or `image/webp` — whatever the vendor actually returned. */
  readonly contentType: string
  /** Base64, without a data-URI prefix. The bytes are never written anywhere by this layer. */
  readonly base64: string
  /** Some vendors rewrite the prompt before drawing; surfacing it is the only way an editor can tell. */
  readonly revisedPrompt?: string
}

export interface ImageGenerationOptions {
  readonly signal?: AbortSignal
}

export interface ImageProviderClient {
  readonly name: string
  readonly model: string
  generate(
    request: ImageRequest,
    options?: ImageGenerationOptions,
  ): Promise<readonly GeneratedImage[]>
}

const MAX_COUNT = 4

export function clampCount(count: number | undefined): number {
  if (count === undefined) return 1
  return Math.min(Math.max(Math.trunc(count), 1), MAX_COUNT)
}

/** Pixel dimensions for the three named shapes. One table, so two adapters cannot disagree. */
export const IMAGE_DIMENSIONS: Readonly<
  Record<ImageSize, { readonly width: number; readonly height: number }>
> = Object.freeze({
  square: { width: 1024, height: 1024 },
  landscape: { width: 1536, height: 640 },
  portrait: { width: 640, height: 1536 },
})
