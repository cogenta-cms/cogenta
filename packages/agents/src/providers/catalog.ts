/**
 * Fiche 56 — the catalog of LLM providers this build knows how to talk to,
 * as pure data. `registry.ts`'s `createProviderRegistry` is the only reader
 * that matters functionally: an entry with `wireFormat: 'openai-compatible'`
 * reuses `createOpenAiClient` completely unmodified, only pointed at a
 * different `defaultBaseUrl` — this is the "zero new network code" the fiche
 * asks for. OpenRouter, DeepSeek, Qwen (DashScope's compatible mode) and GLM
 * (Zhipu/Z.ai) all speak the OpenAI Chat Completions wire format at their own
 * URL; Anthropic and Google keep their own native adapters (different wire
 * formats), listed here only so the admin's catalog screen has one list to
 * render rather than three built-ins plus four extras.
 *
 * `knownModels` is a curated starting point for the admin's model picker,
 * not an exhaustive or authoritative list — every vendor adds and retires
 * models on its own schedule, and this list will drift the moment it is
 * written (verified against each vendor's docs as of 2026-08, the ids most
 * likely to still resolve at read time). The "custom model" text field
 * (`ProviderConfigInput.model` — already free text before this fiche) is
 * what actually lets an operator use anything a vendor ships tomorrow
 * without a code change here.
 */

export type ProviderWireFormat = 'openai-compatible' | 'anthropic' | 'google'

export interface ProviderCatalogEntry {
  readonly id: string
  readonly label: string
  readonly wireFormat: ProviderWireFormat
  /**
   * The full chat-completions URL this vendor's endpoint answers at — this
   * codebase's `baseUrl` is always a complete URL, never a prefix a client
   * appends to (see `openai.ts`'s own `DEFAULT_BASE_URL`). Present on every
   * entry, including the native Anthropic/Google ones, purely as
   * admin-facing documentation of where a request actually goes; only the
   * `openai-compatible` entries feed it to `createOpenAiClient` when an
   * operator has not overridden `baseUrl` themselves.
   */
  readonly defaultBaseUrl: string
  readonly knownModels: readonly string[]
}

export const KNOWN_PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    wireFormat: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
    knownModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    wireFormat: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1/chat/completions',
    knownModels: ['gpt-5.2-chat-latest', 'gpt-5', 'gpt-5-mini'],
  },
  {
    id: 'google',
    label: 'Google',
    wireFormat: 'google',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    knownModels: ['gemini-3.1-pro', 'gemini-3.7-flash', 'gemini-2.5-flash-lite'],
  },
  // The four below are what fiche 56 actually adds: no new adapter, only a
  // catalog entry pointing `openai-compatible` at a different vendor.
  {
    id: 'openrouter',
    label: 'OpenRouter',
    wireFormat: 'openai-compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    knownModels: [
      'openai/gpt-5.2-chat-latest',
      'anthropic/claude-sonnet-5',
      'google/gemini-3.1-pro',
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    wireFormat: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com/chat/completions',
    knownModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    wireFormat: 'openai-compatible',
    // The international (Singapore) region — the one DashScope's own docs
    // lead with. An operator on the China or US region overrides `baseUrl`
    // from the admin form, the same way any custom endpoint does.
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
    knownModels: ['qwen3-max', 'qwen-plus', 'qwen-turbo'],
  },
  {
    id: 'glm',
    label: 'GLM (Zhipu / Z.ai)',
    wireFormat: 'openai-compatible',
    defaultBaseUrl: 'https://api.z.ai/api/openai/v1/chat/completions',
    knownModels: ['glm-4.7', 'glm-4.6', 'glm-4.5-flash'],
  },
]

export function findProviderCatalogEntry(id: string): ProviderCatalogEntry | undefined {
  return KNOWN_PROVIDER_CATALOG.find((entry) => entry.id === id)
}
