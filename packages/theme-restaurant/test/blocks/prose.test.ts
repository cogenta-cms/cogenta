import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { renderBlock } from '../../src/render/render-block.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('prose', () => {
  it('sets the rich text in a body column inside the section rhythm', () => {
    expect(html).toMatch(/^<div class="cr-section cr-prose" data-block="prose">/)
    expect(html).toContain('<div class="cr-prose__body">')
  })

  it('renders real paragraphs and headings, and never a second h1', () => {
    expect(html).toContain('<p>')
    expect(html).toContain('<h2 id="the-kitchen">The kitchen</h2>')
    expect(html).not.toContain('<h1')
  })

  it('applies marks (bold, a real link) rather than leaving them as plain text', () => {
    expect(html).toContain('<strong>2016</strong>')
    expect(html).toContain(
      '<a href="https://example.org/growers" rel="external">eleven growers</a>',
    )
  })

  it('escapes literal markup-significant characters in the source text', () => {
    expect(html).toContain('&amp; write the &lt;menu&gt; on Mondays.')
  })

  it('renders a nested list as real nested lists', () => {
    expect(html).toMatch(/<ul>.*<li>.*<ul>.*<\/ul>.*<\/li>.*<\/ul>/s)
  })

  it('renders a quotation and an inline photograph with its caption', () => {
    expect(html).toContain('<blockquote><p>Three things on a plate.</p></blockquote>')
    expect(html).toContain('<figure class="cg-prose__figure">')
    expect(html).toContain('<figcaption>The pass at seven</figcaption>')
  })

  it('marks a centred prose block as the welcome through its variant, never through its content', () => {
    const welcome = serialize(
      renderBlock({ ...BLOCKS.prose, variant: { align: 'center' } }, ctx) as NonNullable<
        ReturnType<typeof renderBlock>
      >,
    )
    expect(welcome).toContain('data-variant-align="center"')
    expect(html).not.toContain('data-variant-align')
  })
})
