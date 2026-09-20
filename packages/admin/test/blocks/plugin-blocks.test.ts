import { beforeEach, describe, expect, it } from 'vitest'
import { localizeBlockField } from '../../src/blocks/localize-block-fields.js'
import {
  allBlockDefinitions,
  BLOCK_VOCABULARY,
  blockDefinition,
  registerPluginBlocks,
} from '../../src/blocks/vocabulary.js'
import { blockLibrary, searchLibrary } from '../../src/builder/block-library.js'

/**
 * L32 step 3: a block a plugin provides is offered in the editor next to the
 * seventeen of the vocabulary — with its own label and its own fields, and
 * without a single name being added to the frozen vocabulary.
 */

beforeEach(() => {
  registerPluginBlocks([])
})

describe('the blocks a plugin adds to this site', () => {
  it('appear beside the vocabulary, never inside it', () => {
    expect(allBlockDefinitions()).toHaveLength(BLOCK_VOCABULARY.length)

    registerPluginBlocks([
      {
        name: 'callout',
        label: 'Encadré',
        fields: [{ name: 'message', kind: 'text', required: true, localized: false, options: {} }],
      },
    ])

    expect(allBlockDefinitions()).toHaveLength(BLOCK_VOCABULARY.length + 1)
    expect(BLOCK_VOCABULARY.map((block) => block.name)).not.toContain('callout')
    expect(blockDefinition('callout')?.label).toBe('Encadré')
    expect(blockDefinition('callout')?.fields[0]).toMatchObject({
      name: 'message',
      kind: 'text',
      required: true,
    })
  })

  it('are offered by the insertion panel, and found by their own name', () => {
    registerPluginBlocks([{ name: 'callout', label: 'Encadré', fields: [] }])

    expect(blockLibrary().map((entry) => entry.definition.name)).toContain('callout')
    // By the human label and by the block's own type name, like any other.
    expect(searchLibrary('encadre').map((entry) => entry.definition.name)).toContain('callout')
    expect(searchLibrary('callout').map((entry) => entry.definition.name)).toContain('callout')
  })

  /**
   * Contract B declares a select's options as plain strings — `f.select({
   * options: ['start', 'center'] })` — and so does every plugin manifest,
   * which `@cogenta/blocks` refuses outright if it does anything else. This
   * admin keeps its own mirror of the vocabulary where the same options are
   * `{ value }` objects, built by a `selectOptions` helper it applies by
   * hand. Nothing applied it to a plugin's fields, so the strings arrived
   * where objects were expected and reading `.value` off one of them gave
   * `undefined` — which `localizeBlockField` then called `.replaceAll` on.
   * Inserting the block took the whole builder down with an unsaved page.
   */
  it('turns a select declared as plain strings into the option shape this admin renders', () => {
    registerPluginBlocks([
      {
        name: 'callout',
        label: 'Encadré',
        fields: [
          {
            name: 'tone',
            kind: 'select',
            required: false,
            localized: false,
            // Exactly what `examples/plugin-starter` declares.
            options: { options: ['info', 'warning'] },
          },
        ],
      },
    ])

    expect(blockDefinition('callout')?.fields[0]?.options).toEqual({
      options: [{ value: 'info' }, { value: 'warning' }],
    })
  })

  it('localizes a plugin select without throwing on it', () => {
    registerPluginBlocks([
      {
        name: 'callout',
        label: 'Encadré',
        fields: [
          {
            name: 'tone',
            kind: 'select',
            required: false,
            localized: false,
            options: { options: ['info', 'warning'] },
          },
        ],
      },
    ])
    const field = blockDefinition('callout')?.fields[0]
    if (field === undefined) throw new Error('the plugin field was not registered')

    const t = ((key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key) as unknown as Parameters<typeof localizeBlockField>[1]

    expect(() => localizeBlockField(field, t, [])).not.toThrow()
  })

  it('leaves a select already declared as objects alone', () => {
    registerPluginBlocks([
      {
        name: 'callout',
        label: 'Encadré',
        fields: [
          {
            name: 'tone',
            kind: 'select',
            required: false,
            localized: false,
            options: { options: [{ value: 'info', label: 'Information' }] },
          },
        ],
      },
    ])

    expect(blockDefinition('callout')?.fields[0]?.options).toEqual({
      options: [{ value: 'info', label: 'Information' }],
    })
  })

  it('drops a field kind this admin cannot render rather than breaking the screen', () => {
    registerPluginBlocks([
      {
        name: 'callout',
        label: 'Encadré',
        fields: [
          { name: 'message', kind: 'text', required: true, localized: false, options: {} },
          // A kind from a newer server: unknown here, so not offered here.
          { name: 'hologram', kind: 'hologram', required: false, localized: false, options: {} },
        ],
      },
    ])

    expect(blockDefinition('callout')?.fields.map((field) => field.name)).toEqual(['message'])
  })
})
