import type { RichTextDocument } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('prose', () => {
  it('renders the rich text document', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<h2')
    expect(html).toContain('What gets installed')
    expect(html).toContain('<strong>one command</strong>')
  })

  it('contributes no heading of its own', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).not.toMatch(/^<div[^>]*><h1/)
  })

  it('promotes a paragraph whose only span is code-marked to a real <pre><code> block', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<pre class="cg-prose__code"><code>')
    expect(html).toContain('npm create cogenta my-docs')
    // The paragraph the code came from is gone — it is a <pre> now, not a <p>.
    expect(html).not.toContain('<p><code>npm create cogenta')
  })

  it('keeps an ordinary inline `code` mark as <code> inside its paragraph, unpromoted', () => {
    const body: RichTextDocument = [
      {
        _key: 'p1',
        _type: 'block',
        style: 'normal',
        children: [
          { _key: 's1', _type: 'span', text: 'Run ', marks: [] },
          { _key: 's2', _type: 'span', text: 'cogenta serve', marks: ['code'] },
          { _key: 's3', _type: 'span', text: ' next.', marks: [] },
        ],
        markDefs: [],
      },
    ]
    const html = serialize(renderProse({ ...BLOCKS.prose, body }, ctx))
    expect(html).toContain('<p>Run <code>cogenta serve</code> next.</p>')
    expect(html).not.toContain('<pre')
  })

  it('is marked with data-block="prose"', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('data-block="prose"')
  })
})
