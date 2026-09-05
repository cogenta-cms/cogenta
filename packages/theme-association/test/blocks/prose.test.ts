import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('prose', () => {
  it('renders the rich text document as real markup', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('Every donation goes')
    expect(html).toContain('<strong>')
  })

  it('renders a heading from the document starting at h2, never h1', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<h2>')
    expect(html).not.toContain('<h1')
  })

  it('renders a nested list as real <ul>/<li> markup', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<ul>')
    expect(html.match(/<ul>/g)?.length).toBeGreaterThanOrEqual(1)
  })

  it('renders an inline media node as a captioned figure', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('cg-prose__figure')
    expect(html).toContain('Last year')
  })

  it('escapes a hostile character sequence inside a span rather than treating it as markup', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('&lt;winter shelter&gt;')
  })

  it('is marked with data-block="prose"', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('data-block="prose"')
  })
})
