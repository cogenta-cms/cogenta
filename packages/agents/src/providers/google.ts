import { CogentaError } from '@cogenta/core'
import { requestSignalWithTimeout } from './request-signal.js'
import { createToolNameDecoder, encodeToolName } from './tool-names.js'
import type {
  ChatMessage,
  ChatOptions,
  ChatRequest,
  ChatResponse,
  ProviderClient,
  ProviderToolCall,
  StopReason,
} from './types.js'

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

type GooglePart =
  | { readonly text: string }
  | {
      readonly functionCall: {
        readonly name: string
        readonly args: Readonly<Record<string, unknown>>
      }
    }
  | {
      readonly functionResponse: {
        readonly name: string
        readonly response: Readonly<Record<string, unknown>>
      }
    }

interface GoogleContent {
  readonly role: 'user' | 'model'
  readonly parts: readonly GooglePart[]
}

export interface GoogleRequestBody {
  readonly contents: readonly GoogleContent[]
  readonly systemInstruction?: { readonly parts: readonly [{ readonly text: string }] }
  readonly tools?: readonly {
    readonly functionDeclarations: readonly {
      readonly name: string
      readonly description: string
      readonly parameters: Readonly<Record<string, unknown>>
    }[]
  }[]
  readonly generationConfig: {
    readonly maxOutputTokens: number
    readonly temperature?: number
  }
}

interface GoogleResponseBody {
  readonly candidates: readonly {
    readonly content: { readonly parts: readonly GooglePart[] }
    readonly finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER'
  }[]
  readonly usageMetadata: {
    readonly promptTokenCount: number
    readonly candidatesTokenCount: number
  }
}

const STOP_REASON: Record<GoogleResponseBody['candidates'][number]['finishReason'], StopReason> = {
  STOP: 'end_turn',
  MAX_TOKENS: 'max_tokens',
  SAFETY: 'stop_sequence',
  RECITATION: 'stop_sequence',
  OTHER: 'stop_sequence',
}

/**
 * Gemini has no `tool` role and no call-id concept at all — a function
 * result is a `functionResponse` part inside a `user`-role turn, matched to
 * its call by `name` alone. `toolCallId` still has to be threaded through the
 * normalized shape (other vendors need it), so this adapter uses `toolName`
 * when present and falls back to treating `toolCallId` as the name.
 */
function toGoogleContent(message: ChatMessage): GoogleContent {
  if (message.role === 'tool') {
    const name = message.toolName ?? message.toolCallId
    if (name === undefined) {
      throw new CogentaError({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'A tool-role message is missing both toolName and toolCallId.',
        hint: 'Gemini identifies a function result by name — set toolName.',
      })
    }
    return {
      role: 'user',
      // Encoded like the declaration Gemini matched the call against —
      // idempotent on a toolCallId that already is the wire name.
      parts: [
        {
          functionResponse: {
            name: encodeToolName(name),
            response: { result: message.content ?? '' },
          },
        },
      ],
    }
  }

  const role = message.role === 'assistant' ? 'model' : 'user'
  const parts: GooglePart[] = []
  if (message.content !== undefined) parts.push({ text: message.content })
  for (const call of message.toolCalls ?? []) {
    parts.push({ functionCall: { name: encodeToolName(call.name), args: call.input } })
  }
  return { role, parts }
}

/** Pure — no network. */
export function buildGoogleRequest(request: ChatRequest): GoogleRequestBody {
  return {
    contents: request.messages.map(toGoogleContent),
    ...(request.system === undefined
      ? {}
      : { systemInstruction: { parts: [{ text: request.system }] } }),
    ...(request.tools === undefined
      ? {}
      : {
          tools: [
            {
              functionDeclarations: request.tools.map((tool) => ({
                name: encodeToolName(tool.name),
                description: tool.description,
                parameters: tool.inputSchema,
              })),
            },
          ],
        }),
    generationConfig: {
      maxOutputTokens: request.maxTokens,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    },
  }
}

/** Pure — no network. */
export function parseGoogleResponse(
  body: GoogleResponseBody,
  decodeToolName: (wire: string) => string = (wire) => wire,
): ChatResponse {
  const candidate = body.candidates[0]
  if (candidate === undefined) {
    throw new CogentaError({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'Google returned no candidates.',
      hint: 'Retry the request; this is not something the caller can fix by itself.',
    })
  }

  const textParts: string[] = []
  const toolCalls: ProviderToolCall[] = []
  for (const part of candidate.content.parts) {
    if ('text' in part) textParts.push(part.text)
    else if ('functionCall' in part) {
      // Synthesised, not vendor-issued: Gemini never hands back a call id,
      // so the name is the closest stable handle the rest of the runtime has.
      toolCalls.push({
        id: part.functionCall.name,
        name: decodeToolName(part.functionCall.name),
        input: part.functionCall.args,
      })
    }
  }

  return {
    content: textParts.length === 0 ? null : textParts.join(''),
    toolCalls,
    stopReason: STOP_REASON[candidate.finishReason],
    usage: {
      inputTokens: body.usageMetadata.promptTokenCount,
      outputTokens: body.usageMetadata.candidatesTokenCount,
    },
  }
}

export interface GoogleClientConfig {
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/** API key injected at the runtime boundary — never in a prompt or tool input (rule R7). */
export function createGoogleClient(config: GoogleClientConfig): ProviderClient {
  const doFetch = config.fetchImpl ?? fetch
  const base = config.baseUrl ?? DEFAULT_BASE_URL
  const url = `${base}/${config.model}:generateContent?key=${config.apiKey}`

  return {
    name: 'google',
    model: config.model,
    async chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse> {
      const signal = requestSignalWithTimeout(options?.signal)
      const response = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildGoogleRequest(request)),
        signal,
      }).catch((cause: unknown) => {
        if (signal.aborted && options?.signal?.aborted !== true) {
          throw new CogentaError({
            code: 'PROVIDER_REQUEST_FAILED',
            message: 'Google did not answer in time.',
            hint: 'The vendor may be slow or unreachable right now; retry, or check its status page.',
            cause,
          })
        }
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: 'The request to Google could not be sent.',
          hint: 'Check network connectivity and COGENTA_GOOGLE_API_KEY.',
          cause,
        })
      })

      if (response.status === 429) {
        throw new CogentaError({
          code: 'PROVIDER_RATE_LIMITED',
          message: 'Google rate-limited this request.',
          hint: 'Retry with backoff, or lower callsPerHour for this agent.',
        })
      }
      if (!response.ok) {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: `Google returned status ${response.status}.`,
          hint: 'Check the request and COGENTA_GOOGLE_API_KEY.',
          details: { status: response.status },
        })
      }

      const body = (await response.json()) as GoogleResponseBody
      return parseGoogleResponse(body, createToolNameDecoder(request))
    },
  }
}
