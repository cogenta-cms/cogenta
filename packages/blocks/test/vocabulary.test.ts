import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  type AnyBlockDefinition,
  BLOCK_FIELD_KINDS,
  type CtaBlock,
  createBlock,
  ctaBlock,
  type HeroBlock,
  heroBlock,
  parseBlock,
  VOCABULARY,
  VOCABULARY_NAMES,
  vocabularyRegistry,
} from '../src/index.js'
import { INVALID_DATA, VALID_DATA } from './fixtures.js'

const byName = new Map<string, AnyBlockDefinition>(VOCABULARY.map((block) => [block.name, block]))

describe('the vocabulary', () => {
  it('holds exactly the twelve blocks of contract B, in the order the contract lists them', () => {
    expect(VOCABULARY_NAMES).toEqual([
      'hero',
      'prose',
      'mediaFigure',
      'featureGrid',
      'cta',
      'gallery',
      'quote',
      'faq',
      'stats',
      'logos',
      'collectionList',
      'embed',
    ])
  })

  it('leaves every standard block without a fallback, because they are the fallback', () => {
    for (const block of VOCABULARY) expect(block.fallback).toBeNull()
  })

  it('declares every standard block at version 1.0.0 of the frozen vocabulary', () => {
    for (const block of VOCABULARY) expect(block.version).toBe('1.0.0')
  })

  it('uses only the nine field kinds a block schema is allowed', () => {
    for (const block of VOCABULARY) {
      for (const field of Object.values(block.schema)) {
        expect(BLOCK_FIELD_KINDS).toContain(field.kind)
      }
    }
  })

  it('never nests a block zone inside a block', () => {
    for (const block of VOCABULARY) {
      for (const field of Object.values(block.schema)) {
        expect(field.kind).not.toBe('blocks')
      }
    }
  })

  it('only asks for a request-time runtime where the block reads the database', () => {
    for (const block of VOCABULARY) {
      expect(block.runtime).toBe(block.name === 'collectionList' ? 'server' : 'static')
    }
  })

  it('gives the page heading to the hero alone', () => {
    const h1 = VOCABULARY.filter((block) => block.a11y.headingLevel === 'h1')
    expect(h1.map((block) => block.name)).toEqual(['hero'])
  })
})

/** Stamps the envelope the way the writer would, so `parseBlock` can dispatch. */
function place(name: string, data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, _key: `key-${name}`, _type: name, _version: '1.0.0' }
}

describe.each(VOCABULARY_NAMES)('block %s', (name) => {
  it('is registered in the default registry', () => {
    expect(byName.has(name)).toBe(true)
    expect(vocabularyRegistry.get(name)?.name).toBe(name)
  })

  it('accepts a well-formed block and keeps its envelope', () => {
    const data = VALID_DATA[name]
    expect(data).toBeDefined()
    if (data === undefined) return

    const block = parseBlock(place(name, data))
    expect(block._key).toBe(`key-${name}`)
    expect(block._type).toBe(name)
    expect(block._version).toBe('1.0.0')
  })

  it('refuses a malformed block, naming the block and the field', () => {
    const invalid = INVALID_DATA[name]
    expect(invalid).toBeDefined()
    if (invalid === undefined) return

    try {
      parseBlock(place(name, invalid.data))
      expect.unreachable('an invalid block must be refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('BLOCK_INVALID')
      expect(error.message).toContain(`"${name}"`)
      expect(error.details?.fields).toContainEqual(expect.stringContaining(invalid.field))
    }
  })

  it('refuses an unknown field rather than dropping it silently', () => {
    const data = VALID_DATA[name]
    if (data === undefined) return

    expect(() => parseBlock(place(name, { ...data, className: 'hero--large' }))).toThrowError(
      /className/,
    )
  })
})

describe('block typing', () => {
  it('exposes a placed block as a precise type a theme can consume', () => {
    const block: HeroBlock = createBlock(heroBlock, 'k1', VALID_DATA.hero ?? {})
    // Reading these without a cast is the point: contract D imports `HeroBlock`.
    expect(block.title).toBe('A site that runs itself')
    expect(block.actions?.[0]?.emphasis).toBe('primary')
  })

  it('types a required field as present, an optional one as possibly absent', () => {
    const block: CtaBlock = createBlock(ctaBlock, 'k2', VALID_DATA.cta ?? {})
    // `actions` is required, so this reads without `?.` — if that ever stops
    // being true, the required flag has been lost somewhere in the builders.
    expect(block.actions.length).toBe(1)
    expect(block.text?.length).toBeGreaterThan(0)
  })

  it('resolves a block by its _type through the registry', () => {
    const stored = { ...VALID_DATA.quote, _key: 'q', _type: 'quote', _version: '1.0.0' }
    expect(parseBlock(stored, vocabularyRegistry)._type).toBe('quote')
  })
})
