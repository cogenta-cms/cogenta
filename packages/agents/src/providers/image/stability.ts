import { CogentaError } from '@cogenta/core'
import {
  clampCount,
  type GeneratedImage,
  IMAGE_DIMENSIONS,
  type ImageGenerationOptions,
  type ImageProviderClient,
  type ImageRequest,
} from './types.js'

const DEFAULT_BASE_URL = 'https://api.stability.ai/v1/generation'

export interface StabilityRequestBody {
  readonly text_prompts: readonly { readonly text: string; readonly weight: number }[]
  readonly width: number
  readonly height: number
  readonly samples: number
}

interface StabilityResponseBody {
  readonly artifacts?: readonly {
    readonly base64?: string
    readonly finishReason?: string
  }[]
}

/**
 * The second implementation the lot asks for by name — "plusieurs
 * implémentations, jamais un seul fournisseur en dur".
 *
 * Stability's v1 text-to-image endpoint rather than v2beta on purpose: v1 speaks
 * JSON in both directions, v2beta wants `multipart/form-data` and answers with
 * raw bytes, and picking the JSON one keeps the adapter free of a form-encoding
 * dependency for no gain in what Cogenta actually needs (R9).
 */

/** Pure — no network. */
export function buildStabilityRequest(request: ImageRequest): StabilityRequestBody {
  const { width, height } = IMAGE_DIMENSIONS[request.size ?? 'square']
  return {
    text_prompts: [{ text: request.prompt, weight: 1 }],
    width,
    height,
    samples: clampCount(request.count),
  }
}

/** Pure — no network. */
export function parseStabilityResponse(body: StabilityResponseBody): readonly GeneratedImage[] {
  const images: GeneratedImage[] = []
  for (const artifact of body.artifacts ?? []) {
    // `CONTENT_FILTERED` comes back as an artifact with a blank or black image.
    // Dropping it is more honest than showing an editor a black square and
    // letting them wonder what went wrong.
    if (artifact.finishReason === 'CONTENT_FILTERED') continue
    if (artifact.base64 === undefined || artifact.base64.length === 0) continue
    images.push({ contentType: 'image/png', base64: artifact.base64 })
  }
  if (images.length === 0) {
    throw new CogentaError({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'Stability returned no usable image.',
      hint: 'Every candidate was filtered or empty. Reword the prompt and try again.',
    })
  }
  return images
}

export interface StabilityImageClientConfig {
  readonly apiKey: string
  /** The engine id, e.g. `stable-diffusion-xl-1024-v1-0`. */
  readonly model: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

export function createStabilityImageClient(
  config: StabilityImageClientConfig,
): ImageProviderClient {
  const doFetch = config.fetchImpl ?? fetch
  const base = config.baseUrl ?? DEFAULT_BASE_URL

  return {
    name: 'stability',
    model: config.model,
    async generate(request: ImageRequest, options?: ImageGenerationOptions) {
      const response = await doFetch(`${base}/${encodeURIComponent(config.model)}/text-to-image`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildStabilityRequest(request)),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      }).catch((cause: unknown) => {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: 'The image request to Stability could not be sent.',
          hint: 'Check network connectivity and COGENTA_STABILITY_API_KEY.',
          cause,
        })
      })

      if (response.status === 429) {
        throw new CogentaError({
          code: 'PROVIDER_RATE_LIMITED',
          message: 'Stability rate-limited this image request.',
          hint: 'Wait and try again.',
        })
      }
      if (!response.ok) {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: `Stability returned status ${response.status} for an image request.`,
          hint: 'Check the prompt, the engine id and COGENTA_STABILITY_API_KEY.',
          details: { status: response.status },
        })
      }

      return parseStabilityResponse((await response.json()) as StabilityResponseBody)
    },
  }
}
