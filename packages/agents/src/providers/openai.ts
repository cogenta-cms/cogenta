import { CogentaError } from '@cogenta/core'
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ProviderClient,
  ProviderToolCall,
  StopReason,
} from './types.js'

const DEFAULT_BASE_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiToolCall {
  readonly id: string
  readonly type: 'function'
  readonly function: { readonly name: string; readonly arguments: string }
}

interface OpenAiMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: string | null
  readonly tool_calls?: readonly OpenAiToolCall[]
  readonly tool_call_id?: string
}

export interface OpenAiRequestBody {
  readonly model: string
  readonly max_tokens: number
  readonly messages: readonly OpenAiMessage[]
  readonly tools?: readonly {
    readonly type: 'function'
    readonly function: {
      readonly name: string
      readonly description: string
      readonly parameters: Readonly<Record<string, unknown>>
    }
  }[]
  readonly temperature?: number
}

interface OpenAiResponseBody {
  readonly choices: readonly {
    readonly message: {
      readonly content: string | null
      readonly tool_calls?: readonly OpenAiToolCall[]
    }
    readonly finish_reason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
  }[]
  readonly usage: { readonly prompt_tokens: number; readonly completion_tokens: number }
}

const STOP_REASON: Record<OpenAiResponseBody['choices'][number]['finish_reason'], StopReason> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  length: 'max_tokens',
  content_filter: 'stop_sequence',
}

function toOpenAiMessage(message: ChatMessage): OpenAiMessage {
  if (message.role === 'tool') {
    if (message.toolCallId === undefined) {
      throw new CogentaError({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'A tool-role message is missing its toolCallId.',
        hint: "Set toolCallId to the id the model's tool call carried.",
      })
    }
    return { role: 'tool', content: message.content ?? '', tool_call_id: message.toolCallId }
  }

  const toolCalls = message.toolCalls ?? []
  return {
    role: message.role,
    content: message.content ?? null,
    ...(toolCalls.length === 0
      ? {}
      : {
          tool_calls: toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          })),
        }),
  }
}

/** Pure — no network. */
export function buildOpenAiRequest(request: ChatRequest): OpenAiRequestBody {
  const messages: OpenAiMessage[] = []
  if (request.system !== undefined) {
    messages.push({ role: 'system', content: request.system })
  }
  messages.push(...request.messages.map(toOpenAiMessage))

  return {
    model: request.model,
    max_tokens: request.maxTokens,
    messages,
    ...(request.tools === undefined
      ? {}
      : {
          tools: request.tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  }
}

/** Pure — no network. */
export function parseOpenAiResponse(body: OpenAiResponseBody): ChatResponse {
  const choice = body.choices[0]
  if (choice === undefined) {
    throw new CogentaError({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'OpenAI returned no choices.',
      hint: 'Retry the request; this is not something the caller can fix by itself.',
    })
  }

  const toolCalls: ProviderToolCall[] = (choice.message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: call.function.name,
    input: parseArguments(call.function.arguments),
  }))

  return {
    content: choice.message.content,
    toolCalls,
    stopReason: STOP_REASON[choice.finish_reason],
    usage: { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens },
  }
}

function parseArguments(raw: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Readonly<Record<string, unknown>>)
      : {}
  } catch (cause) {
    throw new CogentaError({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: "OpenAI's tool call arguments were not valid JSON.",
      hint: 'This is a vendor-side malformed response; retry the request.',
      cause,
    })
  }
}

export interface OpenAiClientConfig {
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
}

/** API key injected at the runtime boundary — never in a prompt or tool input (rule R7). */
export function createOpenAiClient(config: OpenAiClientConfig): ProviderClient {
  const doFetch = config.fetchImpl ?? fetch
  const url = config.baseUrl ?? DEFAULT_BASE_URL

  return {
    name: 'openai',
    model: config.model,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiRequest(request)),
      }).catch((cause: unknown) => {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: 'The request to OpenAI could not be sent.',
          hint: 'Check network connectivity and COGENTA_OPENAI_API_KEY.',
          cause,
        })
      })

      if (response.status === 429) {
        throw new CogentaError({
          code: 'PROVIDER_RATE_LIMITED',
          message: 'OpenAI rate-limited this request.',
          hint: 'Retry with backoff, or lower callsPerHour for this agent.',
        })
      }
      if (!response.ok) {
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: `OpenAI returned status ${response.status}.`,
          hint: 'Check the request and COGENTA_OPENAI_API_KEY.',
          details: { status: response.status },
        })
      }

      const body = (await response.json()) as OpenAiResponseBody
      return parseOpenAiResponse(body)
    },
  }
}
