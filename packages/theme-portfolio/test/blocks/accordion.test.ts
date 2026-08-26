import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderAccordion', () => {
  it('renders the title at h2 when present', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<h2 class="cg-accordion__title" data-field="title">How we work</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.accordion
    const html = serialize(renderAccordion(untitled, ctx))
    expect(html).not.toContain('cg-accordion__title')
  })

  it('renders each item inside <details>/<summary>, never a scripted widget', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details class="cg-accordion__details">')
    expect(html).toContain('<summary class="cg-accordion__question">')
  })

  it('uses markup and classes of its own, never faq’s', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).not.toContain('cg-faq')
  })

  it('writes a running, zero-padded index for each item', () => {
    const [firstItem] = BLOCKS.accordion.items
    if (firstItem === undefined) throw new Error('fixture must have at least one item')
    const twoItems = {
      ...BLOCKS.accordion,
      items: [...BLOCKS.accordion.items, { ...firstItem, _key: 'ac2', question: 'And after?' }],
    }
    const html = serialize(renderAccordion(twoItems, ctx))
    expect(html).toContain('<span class="cg-accordion__index" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-accordion__index" aria-hidden="true">02</span>')
  })

  it('renders the question as plain text, not a nested heading', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).not.toMatch(/<summary[^>]*><h[1-6]/)
    expect(html).toContain('<span class="cg-accordion__label">Do you share the process?</span>')
  })

  it('renders the answer as rich text, never a plain string', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<div class="cg-accordion__answer">')
    expect(html).toContain('process page')
  })

  it('never emits a script tag or client directive', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/client:/i)
  })

  it('renders one list item per question', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect([...html.matchAll(/<li class="cg-accordion__item">/g)]).toHaveLength(1)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderAccordion(BLOCKS.accordion, ctx))).toMatchSnapshot()
  })
})
