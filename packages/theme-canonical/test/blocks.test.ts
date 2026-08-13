import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../src/render/blocks/collection-list.js'
import { serialize } from '../src/render/html.js'
import { renderBlock } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()

function render(type: keyof typeof BLOCKS): string {
  const node = renderBlock(BLOCKS[type], ctx, { 'b-collection': ENTRIES })
  expect(node, `${type} must render`).not.toBeNull()
  return node === null ? '' : serialize(node)
}

describe('the twelve vocabulary blocks', () => {
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
    // There is no way to emit raw HTML from the render layer, so a field that
    // contains markup is shown, never executed.
    const html = render('prose')
    expect(html).toContain('&amp; the &lt;two planes&gt; note.')
    expect(html).not.toContain('<two planes>')
  })

  it('nests a deeper list item inside the preceding item, not beside it', () => {
    expect(render('prose')).toContain(
      '<li>The render context<ul><li>and nothing else</li></ul></li>',
    )
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
  })
})
