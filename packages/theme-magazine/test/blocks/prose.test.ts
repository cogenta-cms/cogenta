import type { RichTextDocument } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderProse', () => {
  it('wraps the rich text document in the block container', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toMatch(/^<div class="cg-block cg-prose" data-block="prose">/)
  })

  it('renders a single normal paragraph as a bare <p>', () => {
    const body: RichTextDocument = [
      {
        _key: 'p1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'A short dispatch.', marks: [] }],
        markDefs: [],
      },
    ]
    const html = serialize(renderProse({ ...BLOCKS.prose, body }, ctx))
    expect(html).toBe(
      '<div class="cg-block cg-prose" data-block="prose"><p>A short dispatch.</p></div>',
    )
  })

  it('renders an inline media node as a captioned figure with the shared theme-kit class', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('class="cg-prose__figure"')
    expect(html).toContain('The composing stick, mid-line')
  })

  it('renders a blockquote node distinctly from the pull-quote block', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<blockquote><p>Nobody retires from this trade')
  })

  it('renders no block-level heading of its own', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).not.toContain('data-field=')
  })
})
