import {
  type AgentDeclarationStore,
  type ChatOptions,
  type ChatRequest,
  type ChatResponse,
  createProviderRegistry,
  type ProviderClient,
  type ProviderConfigStore,
  resolveProviderRegistryConfig,
  resolveProviderTuningDefaults,
  staticProviderTuningDefaults,
} from '@cogenta/agents'
import { type CogentaConfig, CogentaError, type Logger } from '@cogenta/core'
import type { SiteSettingsStore } from '@cogenta/schema'

/**
 * Where the writing assistant and the site planner find their model.
 *
 * Before this, both read `config.llm` only — so a site whose keys were saved
 * from the admin's Providers screen (the path the admin actually offers) had
 * a superagent that answered and an assistant that said "no AI provider".
 * The order is now the one the theme generator already follows:
 *
 * 1. the admin's provider store, choosing by the named agent's own declared
 *    preference (`preferred`, then `fallback`, with its model override);
 * 2. failing that, any provider enabled in the store — an operator who saved
 *    one key expects the AI features to use it, whatever the seed preference
 *    names;
 * 3. failing that, `config.llm`, for a site configured by file only.
 *
 * Read on every call, never cached: a key saved or disabled from the admin
 * takes effect on the next request, without a restart. Never throws — an
 * unreadable store or an unresolvable provider is R2's "no provider" answer
 * plus a log line.
 */

export interface ResolvedTextProvider {
  readonly client: ProviderClient
  readonly model: string
}

export interface TextProviderSource {
  resolve(): Promise<ResolvedTextProvider | undefined>
}

export interface TextProviderSourceOptions {
  readonly config: CogentaConfig
  readonly settings: SiteSettingsStore
  readonly logger: Logger
  readonly providerStore?: ProviderConfigStore
  readonly agentStore?: AgentDeclarationStore
  /** Whose declared model preference picks among the store's providers. */
  readonly agentName?: string
}

export function createTextProviderSource(options: TextProviderSourceOptions): TextProviderSource {
  async function fromStore(): Promise<ResolvedTextProvider | undefined> {
    const store = options.providerStore
    if (store === undefined) return undefined
    const configured = await resolveProviderRegistryConfig(store)
    const names = Object.keys(configured)
    if (names.length === 0) return undefined
    const registry = createProviderRegistry(
      configured,
      await resolveProviderTuningDefaults(options.settings),
    )
    const declared =
      options.agentName === undefined ? undefined : await options.agentStore?.get(options.agentName)
    const preference = declared?.model
    const preferred =
      preference === undefined
        ? undefined
        : [preference.preferred, preference.fallback].find(
            (name): name is string => name !== undefined && registry.has(name),
          )
    const name = preferred ?? names[0]
    if (name === undefined) return undefined
    const client = registry.get(name)
    // A model override only means something for the provider it was written
    // for: "deepseek-v4-flash" sent to OpenAI would be refused.
    const override = preferred === undefined ? undefined : preference?.model?.trim()
    return { client, model: override === undefined || override === '' ? client.model : override }
  }

  async function fromConfig(): Promise<ResolvedTextProvider | undefined> {
    const llm = options.config.llm
    if (llm === undefined) return undefined
    if (llm.apiKey === undefined || llm.apiKey === '') {
      options.logger.warn('LLM provider configured with no API key, it is ignored', {
        provider: llm.provider,
        variable: 'COGENTA_LLM_API_KEY',
      })
      return undefined
    }
    const registry = createProviderRegistry(
      {
        [llm.provider]: {
          apiKey: llm.apiKey,
          model: llm.model,
          ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
        },
      },
      await resolveProviderTuningDefaults(options.settings),
    )
    const client = registry.get(llm.provider)
    return { client, model: llm.model }
  }

  return {
    async resolve() {
      try {
        return (await fromStore()) ?? (await fromConfig())
      } catch (error) {
        options.logger.warn('LLM provider could not be resolved, AI features stay off', {
          error: error instanceof Error ? error.message : String(error),
        })
        return undefined
      }
    },
  }
}

/**
 * One `ProviderClient` that stays the same object while what it talks to
 * changes: every `chat` resolves the source again and sends the resolved
 * model. Built for tools constructed once at startup (the assistant runtime)
 * that must still follow a key saved from the admin afterwards.
 *
 * `name`/`model` and the tuning numbers describe the last resolution, which
 * `update` also sets; before any, they are empty and the static defaults.
 */
export interface LiveProviderClient extends ProviderClient {
  update(resolved: ResolvedTextProvider | undefined): void
}

export function createLiveProviderClient(source: TextProviderSource): LiveProviderClient {
  let current: ResolvedTextProvider | undefined
  const fallback = staticProviderTuningDefaults()
  return {
    update(resolved) {
      current = resolved
    },
    get name() {
      return current?.client.name ?? ''
    },
    get model() {
      return current?.model ?? ''
    },
    get supportsVision() {
      return current?.client.supportsVision ?? false
    },
    get maxOutputTokens() {
      return current?.client.maxOutputTokens ?? fallback.maxOutputTokens
    },
    get maxCorrectionAttempts() {
      return current?.client.maxCorrectionAttempts ?? fallback.maxCorrectionAttempts
    },
    get requestTimeoutMs() {
      return current?.client.requestTimeoutMs ?? fallback.requestTimeoutMs
    },
    async chat(request: ChatRequest, chatOptions?: ChatOptions): Promise<ChatResponse> {
      const resolved = await source.resolve()
      current = resolved
      // A key removed from the admin must stop being used, not linger.
      if (resolved === undefined) {
        throw new CogentaError({
          code: 'ASSIST_UNAVAILABLE',
          message: 'No AI provider is configured for this site any more.',
          hint: "Enable a provider from the admin's Providers screen.",
        })
      }
      return resolved.client.chat({ ...request, model: resolved.model }, chatOptions)
    },
  }
}
