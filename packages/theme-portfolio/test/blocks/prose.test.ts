import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse, TWO_COLUMN_MIN_WORDS } from '../../src/render/blocks/prose.js'
import { BLOCKS, longProse, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderProse, running text on the studio grid', () => {
  it('keeps a text that does not open on a subhead in one body, unlabelled', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('data-label="false"')
    expect(html).not.toContain('cg-prose__label')
    expect(html).toContain('<div class="cg-prose__body"><p>The season opens with')
  })

  it('moves an opening subhead into the label and leaves the rest in the body', () => {
    const html = serialize(renderProse(longProse('b', 20), ctx))
    expect(html).toContain('data-label="true"')
    expect(html).toContain('<div class="cg-prose__label"><h2>The brief</h2></div>')
    expect(html.match(/<h2>/g)).toHaveLength(1)
  })

  it('counts the words of the body to decide between one and two columns', () => {
    expect(TWO_COLUMN_MIN_WORDS).toBeGreaterThan(80)
    expect(serialize(renderProse(longProse('b', TWO_COLUMN_MIN_WORDS), ctx))).toContain(
      'data-length="long"',
    )
    expect(serialize(renderProse(longProse('b', TWO_COLUMN_MIN_WORDS - 1), ctx))).toContain(
      'data-length="short"',
    )
  })

  it('renders links, strong text, lists, a quotation and a captioned figure from the rich text', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<strong>four series</strong>')
    expect(html).toContain('href="https://example.org/figures"')
    expect(html).toContain('<blockquote><p>A poster should look like the season')
    expect(html).toContain('<figure class="cg-prose__figure">')
    expect(html).toContain('<figcaption>The calendar spread</figcaption>')
  })

  it('writes no field marker: a rich text is not one plain value', () => {
    expect(serialize(renderProse(BLOCKS.prose, ctx))).not.toContain('data-field')
  })
})
