import { beforeEach, describe, expect, it } from 'vitest'
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
