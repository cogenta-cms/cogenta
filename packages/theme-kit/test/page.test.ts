import {
  createBlockRegistry,
  defineBlock,
  f,
  type QuoteBlock,
  VOCABULARY,
  VOCABULARY_NAMES,
  type VocabularyBlock,
  vocabularyRegistry,
} from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import type { HtmlElement } from '../src/html.js'
import { resolveBlockForRender, withBlockVariant } from '../src/page.js'

/**
 * A block a theme ships of its own: it must name a fallback (contract B), and
 * its data happens to be exactly what `quote` also accepts — the realistic
 * case a theme author reaches for when a private block is meant to degrade
 * cleanly on a theme that does not implement it.
 */
const pullQuote = defineBlock({
  name: 'themePullQuote',
  version: '1.0.0',
  runtime: 'static',
  fallback: 'quote',
  a11y: { headingLevel: 'none' },
  schema: { text: f.text({ required: true, max: 1000 }) },
})

/** A private block whose fallback loops back on itself — must never throw here. */
const loopy = defineBlock({
  name: 'loopy',
  version: '1.0.0',
  runtime: 'static',
  fallback: 'loopyFallback',
  a11y: { headingLevel: 'none' },
  schema: {},
})
const loopyFallback = defineBlock({
  name: 'loopyFallback',
  version: '1.0.0',
  runtime: 'static',
  fallback: 'loopy',
  a11y: { headingLevel: 'none' },
  schema: {},
})

/** A private block whose data is not shaped like anything its fallback accepts. */
const incompatible = defineBlock({
  name: 'themeIncompatible',
  version: '1.0.0',
  runtime: 'static',
  fallback: 'cta',
  a11y: { headingLevel: 'none' },
  schema: { onlyMine: f.text() },
})

const registry = createBlockRegistry([...VOCABULARY, pullQuote, loopy, loopyFallback, incompatible])

describe('resolveBlockForRender', () => {
  it('returns a block of the shared vocabulary unchanged, without touching the registry', () => {
    const block: VocabularyBlock = {
      _key: 'k1',
      _type: 'cta',
      _version: '1.0.0',
      title: 'Try it',
      actions: [{ label: 'Go', target: { href: '/go' } }],
    }
    // An empty registry would throw on any lookup — proving the fast path
    // never consults it for a block whose type is already known.
    const empty = createBlockRegistry([])
    expect(resolveBlockForRender(block, VOCABULARY_NAMES, empty)).toBe(block)
  })

  it("falls back a theme's unimplemented private block to its declared fallback, never a blank slot", () => {
    const placed = { _key: 'k2', _type: 'themePullQuote', _version: '1.0.0', text: 'Ship it.' }
    const resolved = resolveBlockForRender(placed, VOCABULARY_NAMES, registry)
    expect(resolved).not.toBeNull()
    expect(resolved?._type).toBe('quote')
    expect((resolved as unknown as QuoteBlock).text).toBe('Ship it.')
  })

  it('drops a block nobody registered rather than throwing', () => {
    const placed = { _key: 'k3', _type: 'neverRegistered', _version: '1.0.0' }
    expect(resolveBlockForRender(placed, VOCABULARY_NAMES, registry)).toBeNull()
  })

  it('drops a block whose fallback chain loops back on itself rather than throwing', () => {
    const placed = { _key: 'k4', _type: 'loopy', _version: '1.0.0' }
    expect(resolveBlockForRender(placed, VOCABULARY_NAMES, registry)).toBeNull()
  })

  it('drops a private block whose stored data does not fit its fallback shape', () => {
    const placed = { _key: 'k5', _type: 'themeIncompatible', _version: '1.0.0', onlyMine: 'x' }
    // `cta` requires `title` and a non-empty `actions` list — neither present.
    expect(resolveBlockForRender(placed, VOCABULARY_NAMES, registry)).toBeNull()
  })

  it('defaults to the shared vocabulary registry when none is passed', () => {
    const block = { _key: 'k6', _type: 'prose', _version: '1.0.0', body: [] }
    expect(resolveBlockForRender(block, VOCABULARY_NAMES)).toBe(block)
    expect(vocabularyRegistry.has('prose')).toBe(true)
  })
})

const ELEMENT: HtmlElement = {
  kind: 'element',
  tag: 'section',
  attrs: { class: 'x' },
  children: [],
}

describe('withBlockVariant', () => {
  it('passes a null element through unchanged', () => {
    expect(withBlockVariant(null, { background: 'muted' })).toBeNull()
  })

  it('adds no attribute at all when variant is undefined', () => {
    expect(withBlockVariant(ELEMENT, undefined)).toBe(ELEMENT)
  })

  it('adds no attribute at all when variant is an empty object', () => {
    const result = withBlockVariant(ELEMENT, {})
    expect(result?.attrs).toEqual({ class: 'x' })
  })

  it('stamps one data attribute per axis actually set, and none for the rest', () => {
    const result = withBlockVariant(ELEMENT, { background: 'muted', width: 'full' })
    expect(result?.attrs).toEqual({
      class: 'x',
      'data-variant-background': 'muted',
      'data-variant-width': 'full',
    })
    expect(result?.attrs['data-variant-spacing']).toBeUndefined()
    expect(result?.attrs['data-variant-align']).toBeUndefined()
  })

  it('stamps all four axes when all four are set', () => {
    const result = withBlockVariant(ELEMENT, {
      background: 'image',
      spacing: 'spacious',
      align: 'end',
      width: 'full',
    })
    expect(result?.attrs).toEqual({
      class: 'x',
      'data-variant-background': 'image',
      'data-variant-spacing': 'spacious',
      'data-variant-align': 'end',
      'data-variant-width': 'full',
    })
  })

  it('never mutates the element it was given', () => {
    withBlockVariant(ELEMENT, { background: 'muted' })
    expect(ELEMENT.attrs).toEqual({ class: 'x' })
  })
})
