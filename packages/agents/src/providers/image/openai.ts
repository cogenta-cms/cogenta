import { CogentaError } from '@cogenta/core'
import {
  clampCount,
  type GeneratedImage,
  type ImageGenerationOptions,
  type ImageProviderClient,
  type ImageRequest,
  type ImageSize,
} from './types.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1/images/generations'

/**
 * OpenAI does not take pixels — it takes one of a short, closed list of size
 * strings, and the list differs by model. `IMAGE_DIMENSIONS` (a real pixel
 * pair, which is what Stability wants) cannot express that: its `landscape`
 * is 1536×640, a perfectly ordinary SDXL shape that **no** OpenAI image model
 * accepts, and sending it is a flat 400 before a single pixel is drawn.
 *
 * Found by running the real API rather than by reading it: the adapter shipped
 * in L18 was only ever tested against its own fixtures, and its own test
 * froze `1536x640` as the expected value.
 */
const OPENAI_SIZES: Readonly<
  Record<'gpt-image' | 'dall-e-3' | 'dall-e-2', Record<ImageSize, string>>
> = Object.freeze({
  'gpt-image': { square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536' },
  'dall-e-3': { square: '1024x1024', landscape: '1792x1024', portrait: '1024x1792' },
  // dall-e-2 renders squares and nothing else. Asking it for a banner is a
  // 400; giving it the square it can draw is the honest degradation.
  'dall-e-2': { square: '1024x1024', landscape: '1024x1024', portrait: '1024x1024' },
})

type OpenAiImageFamily = keyof typeof OPENAI_SIZES

/** Matched on the model name because that is the only signal the caller gives us. */
function familyOf(model: string): OpenAiImageFamily {
  const name = model.toLowerCase()
  if (name.startsWith('dall-e-2')) return 'dall-e-2'
  if (name.startsWith('dall-e-3')) return 'dall-e-3'
  // Anything else is assumed to be the current generation, including a future
  // `gpt-image-2`: guessing forward is right here, since the older models are
  // the ones with names we already know.
  return 'gpt-image'
}

export interface OpenAiImageRequestBody {
  readonly model: string
  readonly prompt: string
  readonly n: number
  readonly size: string
  /**
   * Only ever sent to a `dall-e-*` model.
   *
   * `gpt-image-1` rejects it outright — it always returns base64 and treats
   * the parameter as unknown, which is a 400 and was the second reason a real
   * call failed where the fixtures passed.
   */
  readonly response_format?: 'b64_json'
}

interface OpenAiImageResponseBody {
  readonly data?: readonly {
    readonly b64_json?: string
    readonly revised_prompt?: string
  }[]
}

/** Pure — no network. Exported so the wire shape is testable without a key. */
export function buildOpenAiImageRequest(
  model: string,
  request: ImageRequest,
): OpenAiImageRequestBody {
  const family = familyOf(model)
  return {
    model,
    prompt: request.prompt,
    n: clampCount(request.count),
    size: OPENAI_SIZES[family][request.size ?? 'square'],
    ...(family === 'gpt-image' ? {} : { response_format: 'b64_json' as const }),
  }
}

/**
 * What OpenAI said was wrong.
 *
 * A refusal reported as "status 400" and nothing else is unactionable: the
 * caller cannot tell an unsupported parameter from a refused prompt from a
 * model this account cannot reach. The body carries that sentence, so it
 * travels.
 */
function describeOpenAiError(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return undefined
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message !== '' ? message : undefined
}

/** Pure — no network. */
export function parseOpenAiImageResponse(body: OpenAiImageResponseBody): readonly GeneratedImage[] {
  const entries = body.data ?? []
  const images: GeneratedImage[] = []
  for (const entry of entries) {
    if (entry.b64_json === undefined || entry.b64_json.length === 0) continue
    images.push({
      contentType: 'image/png',
      base64: entry.b64_json,
      ...(entry.revised_prompt === undefined ? {} : { revisedPrompt: entry.revised_prompt }),
    })
  }
  if (images.length === 0) {
    throw new CogentaError({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'OpenAI returned no image data.',
      hint: 'Retry the request; this is not something the caller can fix by rewording alone.',
    })
  }
  return images
}

export interface OpenAiImageClientConfig {
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/** API key injected at the runtime boundary — never in a prompt or a tool input (R7). */
export function createOpenAiImageClient(config: OpenAiImageClientConfig): ImageProviderClient {
  const doFetch = config.fetchImpl ?? fetch
  const url = config.baseUrl ?? DEFAULT_BASE_URL

  return {
    name: 'openai',
    model: config.model,
    async generate(request: ImageRequest, options?: ImageGenerationOptions) {
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiImageRequest(config.model, request)),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      }).catch((cause: unknown) => {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: 'The image request to OpenAI could not be sent.',
          hint: 'Check network connectivity and COGENTA_OPENAI_API_KEY.',
          cause,
        })
      })

      if (response.status === 429) {
        throw new CogentaError({
          code: 'PROVIDER_RATE_LIMITED',
          message: 'OpenAI rate-limited this image request.',
          hint: 'Wait and try again — image generation is rate-limited far more tightly than text.',
        })
      }
      if (!response.ok) {
        const failure = describeOpenAiError(await response.json().catch(() => null))
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message:
            failure === undefined
              ? `OpenAI returned status ${response.status} for an image request.`
              : `OpenAI refused this image request: ${failure}`,
          hint: 'Check the prompt and COGENTA_OPENAI_API_KEY. A refused prompt is reported this way too.',
          details: {
            status: response.status,
            model: config.model,
            ...(failure === undefined ? {} : { providerMessage: failure }),
          },
        })
      }

      return parseOpenAiImageResponse((await response.json()) as OpenAiImageResponseBody)
    },
  }
}
