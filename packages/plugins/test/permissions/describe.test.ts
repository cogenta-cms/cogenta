import { describe, expect, it } from 'vitest'
import { PLUGIN_CAPABILITY_NAMES } from '../../src/manifest.js'
import { DESCRIBABLE_CAPABILITY_NAMES, describeCapability } from '../../src/permissions/describe.js'

const PARAMETERIZED = new Set(['http.fetch', 'storage.read', 'storage.write', 'channel.send'])

/**
 * Raw identifier shapes that must never appear in a translated sentence —
 * the literal acceptance criterion ("aucun identifiant technique brut"),
 * checked mechanically against the whole real vocabulary rather than a
 * couple of hand-picked examples.
 */
const RAW_FRAGMENTS = [
  'content.',
  'media.',
  'schema.',
  'site.config_',
  'deps.',
  'build.',
  'deploy.',
  'http.fetch',
  'storage.read',
  'storage.write',
  'channel.send',
  'agent.',
  'memory.',
  '_draft',
]

describe('describeCapability', () => {
  it('covers every real capability name in the frozen vocabulary', () => {
    expect(DESCRIBABLE_CAPABILITY_NAMES).toEqual(PLUGIN_CAPABILITY_NAMES)
    for (const name of PLUGIN_CAPABILITY_NAMES) {
      const capability = PARAMETERIZED.has(name) ? `${name}:example.test` : name
      expect(() => describeCapability(capability)).not.toThrow()
    }
  })

  it('never leaks a raw technical identifier fragment, across the whole vocabulary', () => {
    for (const name of PLUGIN_CAPABILITY_NAMES) {
      const capability = PARAMETERIZED.has(name) ? `${name}:example.test` : name
      const { sentence } = describeCapability(capability)
      for (const fragment of RAW_FRAGMENTS) {
        expect(sentence, `"${capability}" → "${sentence}" leaks "${fragment}"`).not.toContain(
          fragment,
        )
      }
    }
  })

  it("replicates the lot doc's own two literal examples", () => {
    expect(describeCapability('http.fetch:api.exemple.com').sentence).toBe(
      'Ce plugin pourra envoyer des données à api.exemple.com.',
    )
    expect(describeCapability('content.write_draft').sentence).toBe(
      'Ce plugin pourra créer et modifier des brouillons, mais pas publier.',
    )
  })

  it('assigns a real risk level and category to every capability', () => {
    for (const name of PLUGIN_CAPABILITY_NAMES) {
      const capability = PARAMETERIZED.has(name) ? `${name}:example.test` : name
      const { riskLevel, category } = describeCapability(capability)
      expect(['low', 'medium', 'high']).toContain(riskLevel)
      expect(category.length).toBeGreaterThan(0)
    }
  })

  it('marks bypass-review and destructive capabilities as high risk', () => {
    expect(describeCapability('content.publish').riskLevel).toBe('high')
    expect(describeCapability('content.delete').riskLevel).toBe('high')
    expect(describeCapability('site.config_write').riskLevel).toBe('high')
    expect(describeCapability('deploy.trigger').riskLevel).toBe('high')
  })

  it('marks read-only, own-scope capabilities as low risk', () => {
    expect(describeCapability('content.read').riskLevel).toBe('low')
    expect(describeCapability('storage.read:plugins/mon-plugin').riskLevel).toBe('low')
  })

  it('refuses a capability outside the known vocabulary rather than guessing', () => {
    expect(() => describeCapability('totally.unknown')).toThrow(/No plain-language description/)
  })

  it('substitutes the parameter into parameterized sentences', () => {
    expect(describeCapability('channel.send:telegram').sentence).toContain('telegram')
    expect(describeCapability('storage.write:plugins/mon-plugin').sentence).not.toContain(
      'plugins/mon-plugin',
    )
  })
})
