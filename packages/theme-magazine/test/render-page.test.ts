import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../src/render/blocks/collection-list.js'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()

function render(type: keyof typeof BLOCKS): string {
  const node = renderBlock(BLOCKS[type], ctx, { 'b-collection': ENTRIES })
  expect(node, `${type} must render`).not.toBeNull()
  return node === null ? '' : serialize(node)
}

describe('the seventeen vocabulary blocks', () => {
  for (const block of ALL_BLOCKS) {
    it(`renders ${block._type} to stable markup`, () => {
      expect(render(block._type)).toMatchSnapshot()
    })
  }

  it('renders every block of the vocabulary, none returning null', () => {
    for (const block of ALL_BLOCKS) {
      expect(renderBlock(block, ctx, { 'b-collection': ENTRIES })).not.toBeNull()
    }
  })
})

describe('data that reaches the markup', () => {
  it('escapes angle brackets and ampersands coming from a block field', () => {
    const html = render('prose')
    expect(html).toContain('&amp; the &lt;foundry&gt; ledger.')
    expect(html).not.toContain('<foundry>')
  })

  it('nests a deeper list item inside the preceding item, not beside it', () => {
    expect(render('prose')).toContain(
      '<li>The matrices<ul><li>and the moulds that cast them</li></ul></li>',
    )
  })

  it('renders an internal link whose target could not be resolved as plain text, never a dead anchor', () => {
    const unresolved = makeContext({
      link: (target) => {
        if (typeof target === 'object' && 'collection' in target && target.id === 'guild')
          return '#'
        return ctx.link(target)
      },
    })
    const html = serialize(
      renderBlock(BLOCKS.prose, unresolved, { 'b-collection': ENTRIES }) as NonNullable<
        ReturnType<typeof renderBlock>
      >,
    )
    expect(html).toContain('<li>A binder willing to teach</li>')
    expect(html).not.toContain('href="#"')
    expect(html).toContain('<a href="https://example.org/inventory"')
  })

  it('falls back to a readable title when the entry has none', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
    expect(html).not.toContain('undefined')
  })

  it('renders an empty collection as a message rather than an empty list', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('collection.empty')
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('<ol')
  })
})

/**
 * What a visual page builder needs in order to point at a rendered page and
 * say "that came from this block".
 */
describe('the identity a rendered page carries back to its blocks', () => {
  it('stamps every placed block with the key contract B minted for it', () => {
    const html = serialize(
      renderPage({ title: 'Page', blocks: [BLOCKS.hero, BLOCKS.cta] }, ctx, {}),
    )
    expect(html).toContain(`data-block-key="${BLOCKS.hero._key}"`)
    expect(html).toContain(`data-block-key="${BLOCKS.cta._key}"`)
  })

  it('gives two blocks of the same type two different keys in the markup', () => {
    const second = { ...BLOCKS.cta, _key: 'cta-second' }
    const html = serialize(renderPage({ title: 'Page', blocks: [BLOCKS.cta, second] }, ctx, {}))
    expect(html).toContain(`data-block-key="${BLOCKS.cta._key}"`)
    expect(html).toContain('data-block-key="cta-second"')
  })

  it('names the field behind a plain-text element, and only where one element holds the whole value', () => {
    const hero = serialize(renderBlock(BLOCKS.hero, ctx) ?? { kind: 'text', value: '' })
    expect(hero).toContain('data-field="title"')
    expect(hero).toContain('data-field="subtitle"')

    const prose = serialize(renderBlock(BLOCKS.prose, ctx) ?? { kind: 'text', value: '' })
    expect(prose).not.toContain('data-field=')
  })

  it('adds no attribute to a block whose text lives in repeated list items', () => {
    const html = serialize(renderBlock(BLOCKS.stats, ctx) ?? { kind: 'text', value: '' })
    expect(html.match(/data-field="/gu)).toHaveLength(1)
    expect(html).toContain('data-field="title"')
  })
})
