import type { SiteContext } from '../../src/identity/context.js'
import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'

/**
 * A `ProviderClient` that records what it was asked and answers with whatever
 * the test decides.
 *
 * Not a mock of anything the project forbids mocking: the rule is "pas de mock
 * de la base", and an LLM vendor's API is neither a database nor something that
 * can be run locally. What matters here is *what reaches the wire* — every R7
 * and R8 assertion in this directory reads `calls` rather than trusting a
 * comment.
 */
export interface FakeProvider extends ProviderClient {
  readonly calls: readonly ChatRequest[]
  /** The full text of the last request as it would go over the wire. */
  lastWireText(): string
}

export function createFakeProvider(
  reply: string | ((request: ChatRequest) => string),
): FakeProvider {
  const calls: ChatRequest[] = []

  return {
    name: 'fake',
    model: 'fake-model-1',
    calls,
    lastWireText: () => JSON.stringify(calls.at(-1) ?? {}),
    async chat(request: ChatRequest): Promise<ChatResponse> {
      calls.push(request)
      return {
        content: typeof reply === 'string' ? reply : reply(request),
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 10 },
      }
    },
  }
}

export const TEST_SITE: SiteContext = {
  name: 'Test Site',
  locales: ['en', 'fr'],
}

/** The context every tool call gets in these tests. */
export function toolContext(roles: readonly string[] = ['editor']): {
  site: { name: string; locales: readonly string[]; defaultLocale: string }
  actor: { id: string; roles: readonly string[] }
  logger: {
    info: () => void
    warn: () => void
    error: () => void
  }
  signal: AbortSignal
} {
  return {
    site: { name: 'Test Site', locales: ['en', 'fr'], defaultLocale: 'en' },
    actor: { id: 'user-1', roles },
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    signal: new AbortController().signal,
  }
}
