import {
  createAnthropicClient,
  createGoogleClient,
  createOpenAiClient,
  type ProviderClient,
} from '@cogenta/agents'

export type LlmProviderId = 'none' | 'anthropic' | 'openai' | 'google'

export interface LlmProviderOption {
  readonly id: LlmProviderId
  readonly label: string
  readonly defaultModel?: string
}

/** "aucun pour l'instant" is listed first, not hidden at the bottom — the CMS works without AI (R2), and the wizard's own layout must not suggest otherwise. */
export const LLM_PROVIDERS: readonly LlmProviderOption[] = [
  { id: 'none', label: 'None for now — the CMS works fully without one' },
  { id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-sonnet-5' },
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-5' },
  { id: 'google', label: 'Google', defaultModel: 'gemini-2.5-pro' },
]

export interface ValidateKeyOptions {
  readonly provider: Exclude<LlmProviderId, 'none'>
  readonly apiKey: string
  readonly model: string
  readonly timeoutMs?: number
  /** Test seam only — lets a test stand in for the network without mocking a shared module. */
  readonly fetchImpl?: typeof fetch
}

export interface ValidateKeyResult {
  readonly valid: boolean
  /** Present only when `valid` is `false` — why the check failed, so the recap can say more than "no". */
  readonly reason?: string
}

export interface CreateProviderClientOptions {
  readonly provider: Exclude<LlmProviderId, 'none'>
  readonly apiKey: string
  readonly model: string
  /** Test seam only — lets a test stand in for the network without mocking a shared module. */
  readonly fetchImpl?: typeof fetch
}

/** The same adapter construction `validateApiKey` uses, exported so a later real call (skin generation, L9 task 7) does not duplicate it. */
export function createProviderClient(options: CreateProviderClientOptions): ProviderClient {
  const config = {
    apiKey: options.apiKey,
    model: options.model,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  }
  if (options.provider === 'anthropic') return createAnthropicClient(config)
  if (options.provider === 'openai') return createOpenAiClient(config)
  return createGoogleClient(config)
}

function clientFor(options: ValidateKeyOptions): ProviderClient {
  return createProviderClient(options)
}

/**
 * "Modèle et clé API si un fournisseur est choisi ; validation immédiate de
 * la clé." A one-token round trip is enough to know the key is accepted —
 * this is not the AI skin-generation pipeline (L9 task 7), just a yes/no on
 * whether the provider will work at all.
 */
export async function validateApiKey(options: ValidateKeyOptions): Promise<ValidateKeyResult> {
  const client = clientFor(options)
  const timeoutMs = options.timeoutMs ?? 8_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    await client.chat(
      { model: options.model, messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 },
      { signal: controller.signal },
    )
    return { valid: true }
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}
