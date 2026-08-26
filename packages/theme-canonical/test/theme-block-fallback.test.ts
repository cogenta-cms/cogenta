import {
  createBlockRegistry,
  defineBlock,
  f,
  type UnknownPlacedBlock,
  VOCABULARY,
  type VocabularyBlock,
} from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import { serialize } from '../src/render/html.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { makeContext } from './fixtures.js'

/**
 * Fiche 43, sous-chantier C(ii): a block a theme ships of its own — not one
 * of the shared vocabulary this theme implements directly — must render as
 * its declared `fallback` when the active theme does not implement it,
 * never as a silently blank slot. This is the same contract test, unchanged,
 * against every one of the five in-house themes: the resolution logic lives
 * once in `@cogenta/theme-kit`'s `resolveBlockForRender`, and this only
 * proves each theme's `renderBlock`/`renderPage` actually reach it.
 */
const themePullQuote = defineBlock({
  name: 'themePullQuote',
  version: '1.0.0',
  runtime: 'static',
  fallback: 'quote',
  a11y: { headingLevel: 'none' },
  schema: { text: f.text({ required: true, max: 1000 }) },
})

const registry = createBlockRegistry([...VOCABULARY, themePullQuote])
const ctx = makeContext()

/**
 * A placed block of a type this theme's own closed `VocabularyBlock` union
 * does not name — exactly what a stored, theme-private block looks like
 * crossing the render boundary. `renderBlock` only claims `VocabularyBlock`
 * because it resolves whatever it is actually handed against `registry`
 * first; this cast states that contract rather than reaching for `any`.
 */
function asStored(block: UnknownPlacedBlock): VocabularyBlock {
  return block as unknown as VocabularyBlock
}

describe('a theme-private block this theme does not implement', () => {
  it('renders as its declared fallback rather than a blank slot', () => {
    const placed = asStored({
      _key: 'pull-1',
      _type: 'themePullQuote',
      _version: '1.0.0',
      text: 'Ship it.',
    })
    const node = renderBlock(placed, ctx, {}, registry)
    expect(node).not.toBeNull()
    const html = serialize(node as NonNullable<typeof node>)
    // Rendered by `renderQuote` — the same markup a real `quote` block gets.
    expect(html).toContain('cg-quote')
    expect(html).toContain('Ship it.')
  })

  it('renders as part of a full page, never leaving a null gap between blocks', () => {
    const placed = asStored({
      _key: 'pull-2',
      _type: 'themePullQuote',
      _version: '1.0.0',
      text: 'Ship it.',
    })
    const html = serialize(renderPage({ title: 'Page', blocks: [placed] }, ctx, {}, registry))
    expect(html).toContain('data-block-key="pull-2"')
    expect(html).toContain('Ship it.')
  })

  it('renders as null, not a thrown error, when nothing was registered for it', () => {
    const placed = asStored({ _key: 'x', _type: 'neverRegistered', _version: '1.0.0' })
    expect(renderBlock(placed, ctx)).toBeNull()
  })
})
