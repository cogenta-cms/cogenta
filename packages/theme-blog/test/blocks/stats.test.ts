import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStats(BLOCKS.stats, ctx))

describe('stats, a line of figures', () => {
  it('renders as a real <dl>, each figure paired with its label', () => {
    expect(html).toContain('<dl class="cg-figures__items">')
    expect(html.match(/<div class="cg-figures__item">/g)).toHaveLength(2)
  })

  it('renders the label before the figure in markup, whatever the visual order', () => {
    expect(html).toContain(
      '<dt class="cg-figures__label">Read on the 7:52</dt><dd class="cg-figures__value">312<span class="cg-figures__unit">hours</span></dd>',
    )
  })

  it('renders a unit only when the item declares one', () => {
    expect(html.match(/cg-figures__unit/g)).toHaveLength(1)
  })

  it('opens with the shared section head', () => {
    expect(html).toContain(
      '<h2 class="cg-head__title" data-field="title">Fourteen years, counted</h2>',
    )
  })
})
