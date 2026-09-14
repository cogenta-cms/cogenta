import type { RichTextDocument } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('prose', () => {
  it('renders the rich text document on the reading measure', () => {
    expect(html).toContain('class="cd-prose__body cd-rich"')
    expect(html).toContain('What gets installed')
    expect(html).toContain('<strong>one command</strong>')
  })

  it('contributes no heading of its own and never an h1', () => {
    expect(html).not.toContain('<h1')
  })

  it('gives each heading an id and a link to itself', () => {
    expect(html).toContain(
      '<h2 id="what-gets-installed" class="cd-rich__heading"><a class="cd-anchor" href="#what-gets-installed">What gets installed</a></h2>',
    )
  })

  it('promotes a code-marked paragraph to a labelled code block', () => {
    expect(html).toContain('<figcaption class="cd-code__label">Terminal</figcaption>')
    expect(html).toContain('<pre class="cd-code__pre" tabindex="0"><code>')
  })

  it('keeps an ordinary nested list as a list', () => {
    expect(html).toMatch(
      /<ul><li>The CLI binary<ul><li>and its shell completions<\/li><\/ul><\/li>/,
    )
  })

  it('keeps an inline code mark inside its paragraph', () => {
    const body: RichTextDocument = [
      {
        _key: 'p1',
        _type: 'block',
        style: 'normal',
        children: [
          { _key: 's1', _type: 'span', text: 'Run ', marks: [] },
          { _key: 's2', _type: 'span', text: 'relay start', marks: ['code'] },
          { _key: 's3', _type: 'span', text: ' next.', marks: [] },
        ],
        markDefs: [],
      },
    ]
    const inline = serialize(renderProse({ ...BLOCKS.prose, body }, ctx))
    expect(inline).toContain('<p>Run <code>relay start</code> next.</p>')
    expect(inline).not.toContain('<pre')
  })

  it('is marked with data-block="prose"', () => {
    expect(html).toContain('data-block="prose"')
  })
})
