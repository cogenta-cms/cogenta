import { createBlockRegistry, VOCABULARY_NAMES } from '@cogenta/blocks'
import { definePlugin, type PluginManifest } from '@cogenta/plugins'
import { describe, expect, it } from 'vitest'
import {
  collectPluginBlocks,
  pluginBlockDefinitions,
  pluginBlockFallback,
} from '../src/commands/plugin-blocks.js'

/**
 * L32 step 1: a block a plugin declares is a real block of this site's
 * registry — same validator, same envelope, same fallback chain — without a
 * single name being added to the frozen contract B vocabulary.
 */

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return definePlugin({
    name: 'countdown-plugin',
    version: '1.2.0',
    engine: '^1.0.0',
    capabilities: [],
    runtime: 'server',
    isolated: true,
    provides: {
      blocks: [
        {
          name: 'countdown',
          label: 'Compte à rebours',
          fallback: 'prose',
          headingLevel: 'h2',
          fields: {
            heading: { kind: 'text', required: true, options: { max: 120 } },
            target: { kind: 'text', required: true },
            steps: {
              kind: 'list',
              of: { label: { kind: 'text', required: true }, done: { kind: 'boolean' } },
            },
          },
        },
      ],
    },
    ...overrides,
  })
}

describe('a block a plugin declares', () => {
  it('becomes a real definition, with the plugin’s version and its fallback', () => {
    const [block] = pluginBlockDefinitions(manifest())

    expect(block?.name).toBe('countdown')
    expect(block?.version).toBe('1.2.0')
    expect(block?.fallback).toBe('prose')
    expect(block?.a11y.headingLevel).toBe('h2')
    expect(block?.runtime).toBe('server')
  })

  it('validates stored data the way any other block does', () => {
    const [block] = pluginBlockDefinitions(manifest())

    const good = block?.validator.safeParse({
      _key: 'a',
      _type: 'countdown',
      _version: '1.2.0',
      heading: 'Ouverture',
      target: '2026-12-01',
      steps: [{ _key: 's1', label: 'Réserver', done: true }],
    })
    expect(good?.success).toBe(true)

    // A required field missing, and an item key that is not declared: both
    // refused, because a declared block is not a looser kind of block.
    expect(
      block?.validator.safeParse({ _key: 'a', _type: 'countdown', _version: '1.2.0' }).success,
    ).toBe(false)
    expect(
      block?.validator.safeParse({
        _key: 'a',
        _type: 'countdown',
        _version: '1.2.0',
        heading: 'Ouverture',
        target: '2026-12-01',
        steps: [{ _key: 's1', label: 'Réserver', colour: 'red' }],
      }).success,
    ).toBe(false)
  })

  it('never joins the vocabulary — contract B is untouched', () => {
    pluginBlockDefinitions(manifest())
    expect(VOCABULARY_NAMES).not.toContain('countdown')
    expect(VOCABULARY_NAMES).toHaveLength(17)
  })

  it('degrades into the block it names, filled from the fields it names', () => {
    const registry = createBlockRegistry()
    const provision = {
      name: 'callout',
      fallback: 'quote',
      label: 'Encart',
      fields: {
        message: { kind: 'text', required: true },
        author: { kind: 'text' },
      },
      // Without this mapping the degradation would be a promise nobody keeps:
      // a callout's data does not satisfy `quote`'s schema on its own.
      fallbackFrom: { text: 'message', author: 'author' },
    } as const
    const stored = {
      _key: 'a',
      _type: 'callout',
      _version: '1.2.0',
      message: 'La billetterie ouvre lundi.',
      author: 'L’équipe',
    }

    const degraded = pluginBlockFallback(provision, stored, registry)

    expect(degraded).toMatchObject({
      _key: 'a',
      _type: 'quote',
      text: 'La billetterie ouvre lundi.',
      author: 'L’équipe',
    })
  })

  it('leaves a blank slot rather than markup built from the wrong fields', () => {
    const registry = createBlockRegistry()

    // No mapping declared: nothing is invented.
    expect(
      pluginBlockFallback({ name: 'callout', fallback: 'quote' }, { _key: 'a' }, registry),
    ).toBeNull()

    // A mapping that does not produce what the fallback requires (`quote`
    // needs its text) degrades to nothing rather than to a broken quote.
    expect(
      pluginBlockFallback(
        { name: 'callout', fallback: 'quote', fallbackFrom: { author: 'who' } },
        { _key: 'a', who: 'Someone' },
        registry,
      ),
    ).toBeNull()
  })

  it('still resolves through the registry for a theme that asks', () => {
    const registry = createBlockRegistry()
    for (const block of pluginBlockDefinitions(manifest())) registry.register(block)

    // The registry knows the block and walks its fallback chain — the
    // mechanism contract B has had since L3, now with a real plugin block in
    // it. (Whether the *data* fits is what `pluginBlockFallback` answers.)
    expect(registry.has('countdown')).toBe(true)
    expect(registry.resolveRenderable('countdown', VOCABULARY_NAMES)?.name).toBe('prose')
  })
})

describe('the blocks of every installed plugin', () => {
  const resolved = (name: string, block: string) =>
    ({
      manifest: manifest({
        name,
        provides: { blocks: [{ name: block, fallback: 'prose', label: block }] },
      }),
    }) as never

  it('refuses a name the vocabulary already owns, and says so', () => {
    const set = collectPluginBlocks([resolved('a-plugin', 'gallery')], { taken: VOCABULARY_NAMES })

    expect(set.definitions).toHaveLength(0)
    expect(set.conflicts[0]?.reason).toContain('vocabulary')
  })

  it('gives a name to the first plugin that claims it, and reports the second', () => {
    const set = collectPluginBlocks([
      resolved('first', 'countdown'),
      resolved('second', 'countdown'),
    ])

    expect(set.definitions.map((block) => block.name)).toEqual(['countdown'])
    expect(set.owners.get('countdown')).toBe('first')
    expect(set.conflicts[0]).toMatchObject({ plugin: 'second', block: 'countdown' })
    expect(set.conflicts[0]?.reason).toContain('first')
  })

  it('reports a broken declaration instead of taking the site down', () => {
    const broken = {
      manifest: {
        ...manifest(),
        name: 'broken',
        provides: {
          blocks: [{ name: 'weird', fallback: 'prose', fields: { a: { kind: 'nonsense' } } }],
        },
      },
    } as never

    const set = collectPluginBlocks([broken])

    expect(set.definitions).toHaveLength(0)
    expect(set.conflicts[0]?.block).toBe('weird')
  })
})
