import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('prose', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderProse(BLOCKS.prose, ctx))).toMatchSnapshot()
  })

  it('contributes no heading of its own — headingLevel: none', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).not.toMatch(/<h1/)
  })

  it('starts any rich-text heading at h2, never h1', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<h2>')
  })

  it('escapes angle brackets and ampersands coming from a rich text span', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('&amp; the &lt;two planes&gt; note.')
    expect(html).not.toContain('<two planes>')
  })

  it('nests a deeper list item inside the preceding item, not beside it', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<li>The render context<ul><li>and nothing else</li></ul></li>')
  })

  it('renders an internal link whose target could not be resolved as plain text, never a dead anchor', () => {
    const unresolved = makeContext({
      link: (target) => {
        if (typeof target === 'object' && 'collection' in target && target.id === 'contracts') {
          return '#'
        }
        return ctx.link(target)
      },
    })
    const html = serialize(renderProse(BLOCKS.prose, unresolved))
    expect(html).toContain('<li>A read-only content client</li>')
    expect(html).not.toContain('href="#"')
    expect(html).toContain('<a href="https://example.org/adr-0004"')
  })

  it('renders an inline media node as a figure with a caption', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    // `cg-prose__figure` is a shared class from `@cogenta/theme-kit`'s own
    // `renderRichText`, identical across every theme (like `cg-action`).
    expect(html).toContain('class="cg-prose__figure"')
    expect(html).toContain('<figcaption>The admin, mid-review</figcaption>')
  })

  it('claims no addressable text field — a rich text body is a document, not a string', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).not.toContain('data-field=')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('data-block="prose"')
    expect(html).toContain('class="ce-block ce-prose"')
  })

  it('renders a blockquote node from the rich text document', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<blockquote><p>A site that runs itself.</p></blockquote>')
  })

  it('applies strong emphasis from the span mark', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<strong>no secrets</strong>')
  })
})
