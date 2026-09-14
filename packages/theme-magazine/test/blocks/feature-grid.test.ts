import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))

describe('renderFeatureGrid, a contents panel', () => {
  it('opens on the shared section head, h2', () => {
    expect(html).toContain(
      '<div class="cg-head"><h2 class="cg-head__title" data-field="title">In this issue</h2></div>',
    )
  })

  it('sets each item title one level below the head', () => {
    expect(html).toContain('<h3 class="cg-contents__title">')
  })

  it('makes a linked title the link, with the arrow drawn after the words, never alone', () => {
    expect(html).toContain(
      '<h3 class="cg-contents__title"><a class="cg-arrow-link" href="/en/article/last-cast">The last cast</a></h3>',
    )
  })

  it('sets an unlinked title as plain text', () => {
    expect(html).toContain('<h3 class="cg-contents__title">Reading a forme</h3>')
  })

  it('draws no icon tile, whatever icon name the item carries', () => {
    expect(html).not.toContain('press')
    expect(html).not.toContain('<svg')
  })

  it('counts its items for the stylesheet, capped at four columns', () => {
    expect(html).toContain('data-count="2"')
    const many = {
      ...BLOCKS.featureGrid,
      items: Array.from({ length: 7 }, (_, i) => ({ _key: `k${i}`, title: `Item ${i}` })),
    }
    expect(serialize(renderFeatureGrid(many, ctx))).toContain('data-count="4"')
  })

  it('starts item titles at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const out = serialize(renderFeatureGrid(untitled, ctx))
    expect(out).not.toContain('cg-head')
    expect(out).toContain('<h2 class="cg-contents__title">')
  })

  it('omits the text line of an item that has none', () => {
    const { text: _text, ...first } = BLOCKS.featureGrid.items[0] as NonNullable<
      (typeof BLOCKS.featureGrid.items)[number]
    >
    const out = serialize(renderFeatureGrid({ ...BLOCKS.featureGrid, items: [first] }, ctx))
    expect(out).not.toContain('cg-contents__text')
  })
})
