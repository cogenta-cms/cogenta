import { describe, expect, it } from 'vitest'
import { findProviderCatalogEntry, KNOWN_PROVIDER_CATALOG } from '../../src/providers/catalog.js'

describe('KNOWN_PROVIDER_CATALOG', () => {
  it('has no duplicate ids', () => {
    const ids = KNOWN_PROVIDER_CATALOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes the three natively-adapted vendors with their own wire format', () => {
    expect(findProviderCatalogEntry('anthropic')?.wireFormat).toBe('anthropic')
    expect(findProviderCatalogEntry('google')?.wireFormat).toBe('google')
    expect(findProviderCatalogEntry('openai')?.wireFormat).toBe('openai-compatible')
  })

  // Fiche 56's actual deliverable: OpenRouter, DeepSeek, Qwen and GLM are
  // all configurable through the one openai-compatible client.
  it.each(['openrouter', 'deepseek', 'qwen', 'glm'])(
    '%s is catalogued as openai-compatible with its own defaultBaseUrl',
    (id) => {
      const entry = findProviderCatalogEntry(id)
      expect(entry?.wireFormat).toBe('openai-compatible')
      expect(entry?.defaultBaseUrl.startsWith('https://')).toBe(true)
      expect(entry?.defaultBaseUrl).not.toBe(findProviderCatalogEntry('openai')?.defaultBaseUrl)
    },
  )

  // Fiche feedback, 2026-09-07: DeepSeek's chat-completions endpoint does
  // not accept an inline image — confirmed live, three theme-generation
  // runs with an attached screenshot had zero effect against a real
  // deepseek-v4-flash key until this was corrected.
  it('flags DeepSeek as not vision-capable', () => {
    expect(findProviderCatalogEntry('deepseek')?.supportsVision).toBe(false)
  })

  it('leaves every other entry unset (assume vision-capable), so only DeepSeek is singled out', () => {
    for (const entry of KNOWN_PROVIDER_CATALOG) {
      if (entry.id === 'deepseek') continue
      expect(entry.supportsVision).toBeUndefined()
    }
  })

  it('every entry has at least one known model', () => {
    for (const entry of KNOWN_PROVIDER_CATALOG) {
      expect(entry.knownModels.length).toBeGreaterThan(0)
    }
  })

  it('findProviderCatalogEntry returns undefined for an id it does not know', () => {
    expect(findProviderCatalogEntry('not-a-real-provider')).toBeUndefined()
  })
})
