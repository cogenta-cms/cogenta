import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type AgentDeclarationStore,
  createFileAgentDeclarationStore,
  createFileProviderConfigStore,
  type ProviderConfigStore,
  SUPERAGENT_NAME,
} from '@cogenta/agents'
import {
  type CogentaConfig,
  createLogger,
  createSqliteHandle,
  type DatabaseHandle,
} from '@cogenta/core'
import {
  createSiteSettingsStore,
  ensureSiteSettingsTables,
  type SiteSettingsStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createLiveProviderClient,
  createTextProviderSource,
  type ResolvedTextProvider,
} from '../src/commands/text-provider-source.js'

/**
 * Where the writing assistant, the site planner and the theme generator find
 * their model. The order is the whole point — the admin's own provider store
 * before the config file — and each branch is easy to break silently, which
 * is why they are pinned here rather than only through one end-to-end run.
 */

const SIGNING_KEY = 'test-signing-key-not-a-real-secret'

let directory: string
let db: DatabaseHandle
let settings: SiteSettingsStore
let providerStore: ProviderConfigStore
let agentStore: AgentDeclarationStore

const logger = createLogger({ level: 'silent' })

function configWith(
  llm?: { readonly provider: string; readonly model: string; readonly apiKey: string | undefined },
): CogentaConfig {
  return {
    ...(llm === undefined ? {} : { llm: { ...llm, baseUrl: undefined } }),
    site: { name: 'Test', url: 'https://example.com' },
  } as unknown as CogentaConfig
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cogenta-provider-source-'))
  db = await createSqliteHandle({ url: join(directory, 'site.db') })
  await ensureSiteSettingsTables(db)
  settings = createSiteSettingsStore({ db })
  providerStore = createFileProviderConfigStore({
    dir: join(directory, 'providers'),
    signingKey: SIGNING_KEY,
  })
  agentStore = createFileAgentDeclarationStore({ dir: join(directory, 'agents') })
})

afterEach(async () => {
  await db.close()
  await rm(directory, { recursive: true, force: true })
})

describe('resolving the text provider', () => {
  it('falls back to config.llm when the admin store holds nothing', async () => {
    const source = createTextProviderSource({
      config: configWith({ provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-from-config' }),
      settings,
      logger,
      providerStore,
      agentStore,
      agentName: SUPERAGENT_NAME,
    })

    const resolved = await source.resolve()

    expect(resolved?.client.name).toBe('openai')
    expect(resolved?.model).toBe('gpt-5-mini')
  })

  it('prefers the admin store over the config file, and follows the agent’s declared preference', async () => {
    await providerStore.upsert({ provider: 'openai', apiKey: 'sk-openai', model: 'gpt-5-mini' })
    await providerStore.upsert({
      provider: 'deepseek',
      apiKey: 'sk-deepseek',
      model: 'deepseek-v4-flash',
    })
    await agentStore.create(
      {
        name: SUPERAGENT_NAME,
        identity: { role: 'The superagent.', objectives: ['Answer.'] },
        model: { preferred: 'deepseek', fallback: 'openai', model: 'deepseek-reasoner' },
        tools: [],
      },
      true,
    )

    const source = createTextProviderSource({
      config: configWith({ provider: 'openai', model: 'gpt-5-mini', apiKey: 'sk-from-config' }),
      settings,
      logger,
      providerStore,
      agentStore,
      agentName: SUPERAGENT_NAME,
    })

    const resolved = await source.resolve()

    expect(resolved?.client.name).toBe('deepseek')
    // The model the agent's own declaration names, not the provider's default.
    expect(resolved?.model).toBe('deepseek-reasoner')
  })

  it('takes the declared fallback when the preferred provider is not configured', async () => {
    await providerStore.upsert({ provider: 'openai', apiKey: 'sk-openai', model: 'gpt-5-mini' })
    await agentStore.create(
      {
        name: SUPERAGENT_NAME,
        identity: { role: 'The superagent.', objectives: ['Answer.'] },
        model: { preferred: 'anthropic', fallback: 'openai', model: 'claude-sonnet' },
        tools: [],
      },
      true,
    )

    const resolved = await createTextProviderSource({
      config: configWith(),
      settings,
      logger,
      providerStore,
      agentStore,
      agentName: SUPERAGENT_NAME,
    }).resolve()

    expect(resolved?.client.name).toBe('openai')
    expect(resolved?.model).toBe('claude-sonnet')
  })

  it('never sends a model override to a provider it was not written for', async () => {
    // Neither the preference nor its fallback is configured: the store's own
    // provider answers, and "claude-sonnet" must not travel with it.
    await providerStore.upsert({ provider: 'openai', apiKey: 'sk-openai', model: 'gpt-5-mini' })
    await agentStore.create(
      {
        name: SUPERAGENT_NAME,
        identity: { role: 'The superagent.', objectives: ['Answer.'] },
        model: { preferred: 'anthropic', fallback: 'google', model: 'claude-sonnet' },
        tools: [],
      },
      true,
    )

    const resolved = await createTextProviderSource({
      config: configWith(),
      settings,
      logger,
      providerStore,
      agentStore,
      agentName: SUPERAGENT_NAME,
    }).resolve()

    expect(resolved?.client.name).toBe('openai')
    expect(resolved?.model).toBe('gpt-5-mini')
  })

  it('answers "no provider" rather than throwing when nothing is configured anywhere', async () => {
    const resolved = await createTextProviderSource({
      config: configWith(),
      settings,
      logger,
      providerStore,
      agentStore,
      agentName: SUPERAGENT_NAME,
    }).resolve()

    expect(resolved).toBeUndefined()
  })

  it('ignores a config provider whose key is missing rather than half-using it', async () => {
    const resolved = await createTextProviderSource({
      config: configWith({ provider: 'openai', model: 'gpt-5-mini', apiKey: undefined }),
      settings,
      logger,
    }).resolve()

    expect(resolved).toBeUndefined()
  })
})

describe('the live provider client', () => {
  it('refuses to call a provider that has since been removed, rather than using a stale one', async () => {
    const fake: ResolvedTextProvider = {
      client: {
        name: 'fake',
        model: 'fake-model',
        maxOutputTokens: 1000,
        maxCorrectionAttempts: 1,
        requestTimeoutMs: 1000,
        chat: async () => ({
          content: 'ok',
          toolCalls: [],
          stopReason: 'end_turn' as const,
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      },
      model: 'fake-model',
    }
    let resolvable = true
    const client = createLiveProviderClient({
      resolve: async () => (resolvable ? fake : undefined),
    })

    client.update(fake)
    expect(client.name).toBe('fake')

    resolvable = false
    await expect(
      client.chat({ model: 'fake-model', messages: [{ role: 'user', content: 'hello' }] }),
    ).rejects.toMatchObject({ code: 'ASSIST_UNAVAILABLE' })
  })
})
