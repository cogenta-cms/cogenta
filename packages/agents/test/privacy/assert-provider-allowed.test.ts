import { describe, expect, it } from 'vitest'
import { assertProviderAllowed } from '../../src/privacy/assert-provider-allowed.js'
import type { ProviderClient } from '../../src/providers/types.js'

function clientNamed(name: string): ProviderClient {
  return {
    name,
    model: 'test-model',
    chat: async () => ({
      content: null,
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
  }
}

describe('assertProviderAllowed', () => {
  it('never throws when the policy is disabled', () => {
    expect(() =>
      assertProviderAllowed(clientNamed('anthropic'), { enabled: false, localProviderNames: [] }),
    ).not.toThrow()
  })

  it('allows a provider named in the local allowlist', () => {
    expect(() =>
      assertProviderAllowed(clientNamed('ollama'), {
        enabled: true,
        localProviderNames: ['ollama'],
      }),
    ).not.toThrow()
  })

  it('throws PRIVACY_NO_DATA_LEAVES_VIOLATION for a provider outside the allowlist', () => {
    expect(() =>
      assertProviderAllowed(clientNamed('anthropic'), {
        enabled: true,
        localProviderNames: ['ollama'],
      }),
    ).toThrowError(/"anthropic" is not in the local provider allowlist/)
  })
})
