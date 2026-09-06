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

/** A plain-text segment of a multimodal message. */
export interface ChatTextPart {
  readonly type: 'text'
  readonly text: string
}

/**
 * An inline image segment of a multimodal message. `data` is raw base64 —
 * no `data:` URI prefix — so each adapter can format it however its own
 * wire protocol wants it (a data URL for OpenAI, a bare base64 field for
 * Anthropic and Google).
 */
export interface ChatImagePart {
  readonly type: 'image'
  readonly mediaType: string
  readonly data: string
}

export type ChatContentPart = ChatTextPart | ChatImagePart

export interface ChatMessage {
  readonly role: ChatRole
  /**
   * Absent (not empty-string) when a turn is tool calls with no accompanying
   * text. A plain `string` is the common case and every existing caller
   * keeps compiling and behaving identically; an array of `ChatContentPart`
   * lets a caller attach images alongside text (e.g. the Theme Creator
   * agent handing a model a screenshot a user uploaded).
   */
  readonly content?: string | readonly ChatContentPart[]
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
  /**
   * Absent lets the client fall back to its own configured
   * `maxOutputTokens` (an admin-set property of the provider/model, not a
   * literal a caller should be picking) — see `ProviderClient.maxOutputTokens`.
   * A caller only sets this for a genuine, call-specific reason to differ
   * from that default.
   */
  readonly maxTokens?: number
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
  /**
   * Whether this client can accept a `ChatImagePart` in a message's content.
   * Absent means "unknown, assume no" — a caller building a multimodal
   * message should check this before attaching an image, and degrade
   * (text-only, with an explicit note) when it is not `true`.
   */
  readonly supportsVision?: boolean
  /**
   * The completion budget every call through this client defaults to when
   * a request does not set its own `maxTokens` — a property of *which
   * model this is*, not of any one call site. A reasoning-tier model can
   * spend thousands of tokens "thinking" before it ever writes a visible
   * answer, and that reasoning counts against this same budget; a plain
   * instruct model needs far less. This is why it lives on the provider
   * (admin-configurable from `/admin/providers`, `resolve.ts` resolves it
   * from `ProviderConfigStore`), not as a constant scattered across every
   * caller — a real, reproduced bug (`docs`/changeset history: DeepSeek's
   * `deepseek-v4-flash` hitting `finish_reason: "length"` with empty
   * content at a too-low hardcoded ceiling) is exactly what a per-call
   * hardcoded number cannot adapt to. Resolved adapters
   * (`createAnthropicClient`/`createOpenAiClient`/`createGoogleClient`)
   * always set this to a concrete number — the admin's value, or a built-in
   * fallback when unset — so a caller never needs its own `?? literal`.
   */
  readonly maxOutputTokens?: number
  /**
   * How many times a generate-validate-correct loop (skin generation, brief
   * analysis, content-model/demo-content proposals, the base-theme choice)
   * retries this client before giving up. Same reasoning as
   * `maxOutputTokens`: a model that needs more coaxing to produce valid
   * structured output benefits from more attempts, and that is a fact about
   * the model, set by the admin who chose it — not a number a given call
   * site should be guessing at.
   */
  readonly maxCorrectionAttempts?: number
  /**
   * How long a single HTTP call to this provider is allowed to run before
   * being aborted — both the raw request timeout each adapter applies via
   * `requestSignalWithTimeout`, and the per-model-call timeout the LangGraph
   * agent loop (`runtime/loop.ts`) enforces around `chat()`. A slower
   * (often reasoning-tier) model genuinely needs more wall-clock time, not
   * just more tokens; a fixed timeout picked without knowing which model an
   * admin configured is the same class of mistake as a fixed token budget.
   */
  readonly requestTimeoutMs?: number
  chat(request: ChatRequest, options?: ChatOptions): Promise<ChatResponse>
}
