import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('accordion — "How this blog works"', () => {
  it('renders each item as a zero-JS <details>/<summary> panel', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('data-block="accordion"')
    expect(html).toContain('<details class="cg-panels__details">')
  })

  it("renders its own class names, distinct from faq's", () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('cg-panels__question')
    expect(html).not.toContain('cg-faq')
  })

  it('renders the answer rich text inside the panel body', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('Yes — every post here started as a draft.')
  })
})
