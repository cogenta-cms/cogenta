import { CogentaError } from '@cogenta/core'
import {
  clampCount,
  type GeneratedImage,
  IMAGE_DIMENSIONS,
  type ImageGenerationOptions,
  type ImageProviderClient,
  type ImageRequest,
} from './types.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1/images/generations'

export interface OpenAiImageRequestBody {
  readonly model: string
  readonly prompt: string
  readonly n: number
  readonly size: string
  readonly response_format: 'b64_json'
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
  const { width, height } = IMAGE_DIMENSIONS[request.size ?? 'square']
  return {
    model,
    prompt: request.prompt,
    n: clampCount(request.count),
    size: `${width}x${height}`,
    response_format: 'b64_json',
  }
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
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: `OpenAI returned status ${response.status} for an image request.`,
          hint: 'Check the prompt and COGENTA_OPENAI_API_KEY. A refused prompt is reported this way too.',
          details: { status: response.status },
        })
      }

      return parseOpenAiImageResponse((await response.json()) as OpenAiImageResponseBody)
    },
  }
}
