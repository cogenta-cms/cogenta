/**
 * L4 task 1: the normalized shape every provider adapter speaks, so the
 * execution loop (task 2) calls one interface regardless of vendor. Tool-
 * calling wire formats differ enough between vendors (Anthropic's
 * `tool_use` content blocks, OpenAI's `tool_calls` array, Google's
 * `functionCall` parts) that this is the one place that difference is
 * allowed to exist — everything above `ProviderClient` sees only this.
 */

export type ChatRole = 'user' | 'assistant' | 'tool'

/** One tool invocation the model asked for — never executed here, only described. */
export interface ProviderToolCall {
  readonly id: string
  readonly name: string
  readonly input: Readonly<Record<string, unknown>>
}

export interface ChatMessage {
  readonly role: ChatRole
  /** Absent (not empty-string) when a turn is tool calls with no accompanying text. */
  readonly content?: string
  /** Set on an `assistant` message that requested tool calls. */
  readonly toolCalls?: readonly ProviderToolCall[]
  /** Set on a `tool` message: which call this is the result of. */
  readonly toolCallId?: string
  /** Set on a `tool` message: the tool's name, some vendors require it alongside the id. */
  readonly toolName?: string
}

/** A tool's shape as the model sees it — `inputSchema` is JSON Schema, already converted from the Zod schema `defineTool` (Contract C) declares. */
export interface ProviderToolSpec {
  readonly name: string
  readonly description: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}

export interface ChatRequest {
  readonly model: string
  readonly system?: string
  readonly messages: readonly ChatMessage[]
  readonly tools?: readonly ProviderToolSpec[]
  readonly maxTokens: number
  readonly temperature?: number
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'

export interface TokenUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface ChatResponse {
  /** `null` when the turn is tool calls only, with no accompanying text. */
  readonly content: string | null
  readonly toolCalls: readonly ProviderToolCall[]
  readonly stopReason: StopReason
  readonly usage: TokenUsage
}

export interface ChatOptions {
  /** Cancels the underlying HTTP request — the execution loop's own timeout/cancellation (task 2) threads through here. */
  readonly signal?: AbortSignal
}

/** What every adapter implements — the execution loop (task 2) depends on this, never on a vendor SDK type directly. */
export interface ProviderClient {
  readonly name: string
  readonly model: string
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>
}
