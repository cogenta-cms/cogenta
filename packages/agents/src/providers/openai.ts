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
            function: { name: encodeToolName(call.name), arguments: JSON.stringify(call.input) },
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
              name: encodeToolName(tool.name),
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }),
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
  }
}

/** Pure — no network. */
export function parseOpenAiResponse(
  body: OpenAiResponseBody,
  decodeToolName: (wire: string) => string = (wire) => wire,
): ChatResponse {
  const choice = body.choices[0]
  if (choice === undefined) {
    throw new CogentaError({
      code: 'PROVIDER_RESPONSE_INVALID',
      message: 'The OpenAI-compatible endpoint returned no choices.',
      hint: 'Retry the request; this is not something the caller can fix by itself.',
    })
  }

  const toolCalls: ProviderToolCall[] = (choice.message.tool_calls ?? []).map((call) => ({
    id: call.id,
    name: decodeToolName(call.function.name),
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
      message: "The endpoint's tool call arguments were not valid JSON.",
      hint: 'This is a vendor-side malformed response; retry the request.',
      cause,
    })
  }
}

const MAX_REASON_LENGTH = 300

/**
 * The human-readable part of an OpenAI-shaped error body
 * (`{ error: { message } }`), or the first line of a non-JSON body, capped
 * so a vendor's HTML error page never becomes the message. `undefined` when
 * there is nothing legible to show.
 */
async function readErrorReason(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => '')
  if (text.trim() === '') return undefined
  let reason = text
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const error = (parsed as { error: unknown }).error
      if (typeof error === 'string') reason = error
      else if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message: unknown }).message
        if (typeof message === 'string') reason = message
      }
    }
  } catch {
    // Not JSON — keep the raw text.
  }
  const firstLine = reason.split('\n')[0]?.trim() ?? ''
  if (firstLine === '') return undefined
  return firstLine.length > MAX_REASON_LENGTH
    ? `${firstLine.slice(0, MAX_REASON_LENGTH)}…`
    : firstLine
}

export interface OpenAiClientConfig {
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly fetchImpl?: typeof fetch
  /**
   * The provider id this client reports itself as — `client.name`, used by
   * the privacy allowlist (`assertProviderAllowed`) and by anything logging
   * or citing "which provider answered". Defaults to `'openai'`, but every
   * `wireFormat: 'openai-compatible'` catalog entry (fiche 56: OpenRouter,
   * DeepSeek, Qwen, GLM, or an operator's custom endpoint) passes its own
   * catalog id here — without this, every one of them would misreport
   * itself as literally `'openai'`, silently defeating a "no data leaves
   * this machine" policy scoped to a different vendor.
   */
  readonly name?: string
}

/** API key injected at the runtime boundary — never in a prompt or tool input (rule R7). */
export function createOpenAiClient(config: OpenAiClientConfig): ProviderClient {
  const doFetch = config.fetchImpl ?? fetch
  const url = config.baseUrl ?? DEFAULT_BASE_URL
  const name = config.name ?? 'openai'

  return {
    name,
    model: config.model,
    async chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse> {
      const signal = requestSignalWithTimeout(options?.signal)
      const response = await doFetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAiRequest(request)),
        signal,
      }).catch((cause: unknown) => {
        if (signal.aborted && options?.signal?.aborted !== true) {
          throw new CogentaError({
            code: 'PROVIDER_REQUEST_FAILED',
            message: `"${name}" did not answer in time.`,
            hint: 'The vendor may be slow or unreachable right now; retry, or check its status page.',
            cause,
          })
        }
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message: `The request to "${name}" could not be sent.`,
          hint: "Check network connectivity and this provider's saved API key.",
          cause,
        })
      })

      if (response.status === 429) {
        throw new CogentaError({
          code: 'PROVIDER_RATE_LIMITED',
          message: `"${name}" rate-limited this request.`,
          hint: 'Retry with backoff, or lower callsPerHour for this agent.',
        })
      }
      if (!response.ok) {
        // The vendor's own error text is the only thing that tells a 400
        // ("model does not exist", "unsupported parameter") from a 401 —
        // dropping it left an operator staring at a bare status code with
        // nothing to act on. It never carries the key; it is safe to quote.
        const reason = await readErrorReason(response)
        throw new CogentaError({
          code: 'PROVIDER_REQUEST_FAILED',
          message:
            reason === undefined
              ? `"${name}" returned status ${response.status}.`
              : `"${name}" returned status ${response.status}: ${reason}`,
          hint:
            response.status === 400
              ? "Check the model name saved for this provider — it must be one this endpoint actually serves — then the request. The provider's own message above usually names the field."
              : "Check the request and this provider's saved API key.",
          details: { status: response.status, ...(reason === undefined ? {} : { reason }) },
        })
      }

      const body = (await response.json()) as OpenAiResponseBody
      return parseOpenAiResponse(body, createToolNameDecoder(request))
    },
  }
}
