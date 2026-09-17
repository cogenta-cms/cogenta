import { safeParseBlock, VOCABULARY } from '@cogenta/blocks'
import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ContentBlock } from '../../src/api/content-client.js'
import {
  describeBlockRefusal,
  findBlockProblems,
  withoutUntouchedBlocks,
} from '../../src/blocks/validate-blocks.js'
import {
  BLOCK_VOCABULARY,
  type ItemFieldDefinition,
  startingBlockData,
} from '../../src/blocks/vocabulary.js'
import fr from '../../src/i18n/locales/fr.json'

/**
 * The admin checks blocks before saving (L36 audit) so an editor is told
 * which block and which field to fix. It must never be stricter than the
 * server: every problem it reports is checked here against contract B's own
 * validator, across empty, freshly placed, complete and partly emptied blocks.
 */

const t = i18next.getFixedT('fr')

beforeAll(async () => {
  await i18next.init({ lng: 'fr', resources: { fr: { translation: fr } } })
})

const UUID = '01920000-0000-7000-8000-000000000000'

function sample(shape: Pick<ItemFieldDefinition, 'kind' | 'options'>): unknown {
  switch (shape.kind) {
    case 'text':
      return 'sample'
    case 'number':
      return 1
    case 'boolean':
      return true
    case 'richText':
      return [
        {
          _key: 'p',
          _type: 'block',
          style: 'normal',
          children: [{ _key: 's', _type: 'span', text: 'x' }],
        },
      ]
    case 'media':
      return UUID
    case 'link':
      return { href: 'https://example.test/' }
    case 'select': {
      const choices = shape.options['options'] as readonly { value: string }[] | undefined
      return choices?.[0]?.value ?? 'pages'
    }
    case 'json': {
      const items = (shape.options['items'] ?? []) as readonly ItemFieldDefinition[]
      const filled = (keyed: boolean) =>
        Object.fromEntries([
          ...items.filter((item) => item.required).map((item) => [item.name, sample(item)]),
          ...(keyed ? [['_key', 'k1']] : []),
        ])
      if (shape.options['list'] === true) {
        const min = typeof shape.options['min'] === 'number' ? shape.options['min'] : 1
        return Array.from({ length: Math.max(min, 1) }, (_, index) => ({
          ...filled(shape.options['keyed'] !== false),
          ...(shape.options['keyed'] !== false ? { _key: `k${index}` } : {}),
        }))
      }
      if (shape.options['object'] === true) return filled(false)
      if ('sample' in shape.options) return shape.options['sample']
      return undefined
    }
    default:
      return undefined
  }
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune)
  if (value === null || typeof value !== 'object') return value
  if ('_type' in value) return value
  const out: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) {
    const next = prune(member)
    if (next === null || next === '' || next === undefined) continue
    if (typeof next === 'object' && !Array.isArray(next) && Object.keys(next).length === 0) continue
    out[key] = next
  }
  return out
}

function serverAccepts(block: ContentBlock): boolean {
  const version = VOCABULARY.find((entry) => entry.name === block.type)?.version ?? '1.0.0'
  return safeParseBlock({
    ...(prune(block.data) as object),
    _key: block.key,
    _type: block.type,
    _version: version,
  }).ok
}

function variants(type: string): readonly Readonly<Record<string, unknown>>[] {
  const definition = BLOCK_VOCABULARY.find((block) => block.name === type)
  if (definition === undefined) return []
  const complete: Record<string, unknown> = {}
  for (const field of definition.fields) {
    if (field.required) complete[field.name] = sample(field)
  }
  const out: Readonly<Record<string, unknown>>[] = [{}, startingBlockData(type), complete]
  for (const field of definition.fields) {
    out.push({ ...complete, [field.name]: '' }, { ...complete, [field.name]: null })
    const items = (field.options['items'] ?? []) as readonly ItemFieldDefinition[]
    const value = complete[field.name] ?? sample(field)
    for (const item of items) {
      if (Array.isArray(value)) {
        out.push({ ...complete, [field.name]: [{ ...value[0], [item.name]: '' }] })
      } else if (value !== null && typeof value === 'object') {
        out.push({ ...complete, [field.name]: { ...value, [item.name]: '' } })
      }
      if (item.kind === 'link' && Array.isArray(value)) {
        out.push({ ...complete, [field.name]: [{ ...value[0], [item.name]: { href: '' } }] })
        out.push({
          ...complete,
          [field.name]: [{ ...value[0], [item.name]: { collection: 'page', id: '' } }],
        })
      }
    }
  }
  return out
}

describe('checking blocks before a save', () => {
  for (const definition of BLOCK_VOCABULARY) {
    it(`never refuses a "${definition.name}" block the server would store`, () => {
      for (const data of variants(definition.name)) {
        const block: ContentBlock = { key: 'b1', type: definition.name, data }
        if (findBlockProblems([block], t).length > 0) {
          expect(serverAccepts(block), JSON.stringify(data)).toBe(false)
        }
      }
    })
  }

  it('names the block, its position and the field to fix, in the admin language', () => {
    const blocks: ContentBlock[] = [
      { key: 'a', type: 'prose', data: { body: sample({ kind: 'richText', options: {} }) } },
      {
        key: 'b',
        type: 'cta',
        data: {
          title: 'Parlons',
          actions: [{ label: 'Écrire', target: { collection: 'page', id: '' } }],
        },
      },
    ]
    const [problem] = findBlockProblems(blocks, t)
    expect(problem?.key).toBe('b')
    expect(problem?.message).toContain('Bloc 2 « Appel à action »')
    expect(problem?.message).toContain('Boutons › élément 1 › Destination')
  })

  it('leaves out of a new page the starting blocks nobody wrote in, and keeps the rest', () => {
    const zones = {
      body: [
        { key: 'a', type: 'prose', data: {} },
        { key: 'b', type: 'collectionList', data: startingBlockData('collectionList') },
        { key: 'c', type: 'hero', data: { title: 'Bonjour', subtitle: '' } },
      ],
    }
    expect(withoutUntouchedBlocks(zones).body?.map((block) => block.key)).toEqual(['c'])
  })

  it("describes the server's own refusal the same way", () => {
    const blocks: ContentBlock[] = [{ key: 'home-cta', type: 'cta', data: {} }]
    const found = describeBlockRefusal(
      'Block "cta" (home-cta) is invalid:\n  actions.0.target: Invalid input',
      blocks,
      t,
    )
    expect(found?.message).toContain(
      'Bloc 1 « Appel à action » — Boutons › élément 1 › Destination',
    )
  })
})
