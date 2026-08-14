import { describe, expect, it } from 'vitest'
import { createProviderRegistry } from '../../src/providers/registry.js'

describe('createProviderRegistry', () => {
  it('has() reflects only what was configured, so R2 (no provider means no agents, not a crash) holds by construction', () => {
    const registry = createProviderRegistry({})

    expect(registry.has('anthropic')).toBe(false)
    expect(registry.has('openai')).toBe(false)
    expect(registry.has('google')).toBe(false)
  })

  it('get() returns a client for a configured provider, named after it', () => {
    const registry = createProviderRegistry({
      anthropic: { apiKey: 'test-key', model: 'claude-sonnet-5' },
    })

    expect(registry.has('anthropic')).toBe(true)
    expect(registry.get('anthropic').name).toBe('anthropic')
    expect(registry.get('anthropic').model).toBe('claude-sonnet-5')
  })

  it('get() throws PROVIDER_UNKNOWN for a provider that was not configured', () => {
    const registry = createProviderRegistry({})

    expect(() => registry.get('openai')).toThrowError(/No provider named "openai"/)
  })
})
