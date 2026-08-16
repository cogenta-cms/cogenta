import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'

/**
 * A provider that answers from a script and records everything it was sent.
 *
 * No network, no key: R2 is not only about the CMS working without AI, it is
 * about this package's own tests not needing a vendor. What the tests here
 * actually assert is the shape of the request — which is where R8 lives —
 * and the pipeline's behaviour when the model misbehaves, which a real
 * model could not be made to do on demand anyway.
 */
export interface FakeProvider {
  readonly client: ProviderClient
  readonly requests: ChatRequest[]
}

export type ScriptedReply = string | ((request: ChatRequest, index: number) => string)

export function scriptedClient(replies: readonly ScriptedReply[]): FakeProvider {
  const requests: ChatRequest[] = []
  let index = 0

  const client: ProviderClient = {
    name: 'scripted',
    model: 'scripted-1',
    async chat(request): Promise<ChatResponse> {
      requests.push(request)
      const reply = replies[Math.min(index, replies.length - 1)]
      const content = typeof reply === 'function' ? reply(request, index) : (reply ?? '')
      index++
      return {
        content,
        toolCalls: [],
        stopReason: 'end_turn',
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    },
  }

  return { client, requests }
}

/** A provider that always throws, for the "no model reachable" paths. */
export function failingClient(message: string): ProviderClient {
  return {
    name: 'failing',
    model: 'failing-1',
    chat(): Promise<ChatResponse> {
      return Promise.reject(new Error(message))
    },
  }
}
