import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderProse', () => {
  it('wraps the rich text in the block frame', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toMatch(/^<div class="cg-block cg-prose" data-block="prose">/)
  })

  it('starts headings at h2', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<h2>What the theme sees</h2>')
    expect(html).not.toContain('<h1')
  })

  it('escapes markup-looking text from a span rather than emitting it', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('&amp; the &lt;two planes&gt; note.')
    expect(html).not.toContain('<two planes>')
  })

  it('renders a strong mark', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<strong>no secrets</strong>')
  })

  it('renders an external link mark', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<a href="https://example.org/adr-0004" rel="external">ADR-0004</a>')
  })

  it('nests a deeper list item inside the preceding item, not beside it', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<li>The render context<ul><li>and nothing else</li></ul></li>')
  })

  it('renders a blockquote node', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<blockquote><p>A site that runs itself.</p></blockquote>')
  })

  it('renders an inline media node as a figure with a caption', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('cg-prose__figure')
    expect(html).toContain('The admin, mid-review')
  })

  it('never emits an internal link the render context could not resolve', () => {
    const unresolved = makeContext({
      link: (target) => {
        if (typeof target === 'object' && 'collection' in target && target.id === 'contracts') {
          return '#'
        }
        return ctx.link(target)
      },
    })
    const html = serialize(renderProse(BLOCKS.prose, unresolved))
    expect(html).not.toContain('href="#"')
    expect(html).toContain('<li>A read-only content client</li>')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderProse(BLOCKS.prose, ctx))).toMatchSnapshot()
  })
})
