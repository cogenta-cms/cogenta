import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderCta(BLOCKS.cta, ctx))

describe('cta', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('is a line of the page, not a coloured box', () => {
    expect(html).toContain('class="ce-section ce-cta"')
    expect(html).not.toMatch(/banner|promo|card/)
  })

  it('titles itself at h2 and marks the title as an editable field', () => {
    expect(html).toContain(
      '<h2 class="ce-cta__title" data-field="title">Letters from the workshop</h2>',
    )
  })

  it('sets the sentence and the actions together, after the title', () => {
    expect(html.indexOf('ce-cta__title')).toBeLessThan(html.indexOf('ce-cta__body'))
    expect(html).toContain('<p class="ce-cta__text" data-field="text">')
  })

  it('labels the action list with the block title', () => {
    expect(html).toContain('<ul class="cg-actions" aria-label="Letters from the workshop">')
  })

  it('keeps an unstated emphasis secondary: an arrow link, not a button', () => {
    expect(html).toContain('data-emphasis="secondary"')
  })

  it('passes an email address through unchanged', () => {
    expect(html).toContain('href="mailto:letters@example.org"')
  })

  it('omits the sentence when the block has none', () => {
    const { text: _text, ...rest } = BLOCKS.cta
    expect(serialize(renderCta(rest, ctx))).not.toContain('ce-cta__text')
  })
})
