import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderAccordion', () => {
  it('renders each entry inside <details>/<summary>, no scripted accordion', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details class="cg-dossier__details">')
    expect(html).toContain('<summary class="cg-dossier__term">')
  })

  it('uses markup and class names of its own, not faq’s', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).not.toContain('cg-mailbag')
  })

  it('omits the block title when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.accordion
    const html = serialize(renderAccordion(untitled, ctx))
    expect(html).not.toContain('cg-dossier__title')
  })

  it('renders the answer through the shared rich-text renderer', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('Only the composing stick, and only if asked.')
  })

  it('renders the question as plain text, not rich text', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('Do you sell the composing equipment?')
  })
})
