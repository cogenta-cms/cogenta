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

const API_VERSION = '2023-06-01'
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1/messages'

type AnthropicContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use'
      readonly id: string
      readonly name: string
      readonly input: unknown
    }
  | { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: string }

interface AnthropicMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string | readonly AnthropicContentBlock[]
}

export interface AnthropicRequestBody {
  readonly model: string
  readonly max_tokens: number
  readonly system?: string
  readonly messages: readonly AnthropicMessage[]
  readonly tools?: readonly {
    readonly name: string
    readonly description: string
    readonly input_schema: Readonly<Record<string, unknown>>
  }[]
  readonly temperature?: number
}

interface AnthropicResponseBody {
  readonly content: readonly AnthropicContentBlock[]
  readonly stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use'
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number }
}

const STOP_REASON: Record<AnthropicResponseBody['stop_reason'], StopReason> = {
  end_turn: 'end_turn',
  max_tokens: 'max_tokens',
  stop_sequence: 'stop_sequence',
  tool_use: 'tool_use',
}

function toAnthropicMessage(message: ChatMessage): AnthropicMessage {
  if (message.role === 'tool') {
    if (message.toolCallId === undefined) {
      throw new CogentaError({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'A tool-role message is missing its toolCallId.',
        hint: "Set toolCallId to the id the model's tool_use call carried.",
      })
    }
    return {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content ?? '' },
      ],
    }
  }

  const role = message.role === 'assistant' ? 'assistant' : 'user'
  const blocks: AnthropicContentBlock[] = []
  if (message.content !== undefined) blocks.push({ type: 'text', text: message.content })
  for (const call of message.toolCalls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: call.id,
      name: encodeToolName(call.name),
      input: call.input,
    })
  }
  // A plain string is equivalent to a single text block and reads better in
  // request logs — only messages that carry tool content need the array form.
  if (blocks.length === 1 && blocks[0]?.type === 'text') {
    return { role, content: blocks[0].text }
  }
  return { role, content: blocks }
}

/** Pure — no network. The whole reason this is separate from `createAnthropicClient` is to unit-test the mapping without a live call. */
export function buildAnthropicRequest(request: ChatRequest): AnthropicRequestBody {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    ...(request.system === undefined ? {} : { system: request.system }),
    messages: request.messages.map(toAnthropicMessage),
    ...(request.tools === undefined
      ? {}
      : {
          tools: request.tools.map((tool) => ({
            name: encodeToolName(tool.name),
            description: tool.description,
            input_schema: tool.inputSchema,
          })),
        }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  }
}

/** Pure — no network. */
export function parseAnthropicResponse(
  body: AnthropicResponseBody,
  decodeToolName: (wire: string) => string = (wire) => wire,
): ChatResponse {
  const textParts: string[] = []
  const toolCalls: ProviderToolCall[] = []
  for (const block of body.content) {
    if (block.type === 'text') textParts.push(block.text)
    else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: decodeToolName(block.name),
        input: (block.input ?? {}) as Readonly<Record<string, unknown>>,
      })
    }
  }
  return {
    content: textParts.length === 0 ? null : textParts.join(''),
    toolCalls,
    stopReason: STOP_REASON[body.stop_reason],
    usage: { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens },
  }
}

export interface AnthropicClientConfig {
  readonly apiKey: string
  readonly model: string
  /** Overridable for tests — never for anything else. */
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/**
 * The API key is injected here, at the runtime boundary, from
 * `COGENTA_ANTHROPIC_API_KEY` (or wherever the caller sources it) — never
 * placed in a prompt or tool input (rule R7).
 */
export function createAnthropicClient(config: AnthropicClientConfig): ProviderClient {
  const doFetch = config.fetchImpl ?? fetch
  const url = config.baseUrl ?? DEFAULT_BASE_URL

  return {
    name: 'anthropic',
    model: config.model,
    async chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse> {
      const signal = requestSignalWithTimeout(options?.signal)
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(buildAnthropicRequest(request)),
        signal,
      }).catch((cause: unknown) => {
        if (signal.aborted && options?.signal?.aborted !== true) {
          throw new CogentaError({
            code: 'PROVIDER_REQUEST_FAILED',
            message: 'Anthropic did not answer in time.',
            hint: 'The vendor may be slow or unreachable right now; retry, or check its status page.',
            cause,
          })
        }
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: 'The request to Anthropic could not be sent.',
          hint: 'Check network connectivity and COGENTA_ANTHROPIC_API_KEY.',
          cause,
        })
      })

      if (response.status === 429) {
        throw new CogentaError({
          code: 'PROVIDER_RATE_LIMITED',
          message: 'Anthropic rate-limited this request.',
          hint: 'Retry with backoff, or lower callsPerHour for this agent.',
        })
      }
      if (!response.ok) {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: `Anthropic returned status ${response.status}.`,
          hint: 'Check the request and COGENTA_ANTHROPIC_API_KEY.',
          details: { status: response.status },
        })
      }

      const body = (await response.json()) as AnthropicResponseBody
      return parseAnthropicResponse(body, createToolNameDecoder(request))
    },
  }
}
