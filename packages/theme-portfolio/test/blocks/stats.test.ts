import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStats(BLOCKS.stats, ctx))

describe('renderStats, figures side by side', () => {
  it('sets the figures as a description list, one group per figure', () => {
    expect(html).toContain('<dl class="cg-figures__items">')
    expect(html.match(/<div class="cg-figures__item">/g)).toHaveLength(2)
  })

  it('sets the value, then the unit after it, then what it counts', () => {
    expect(html).toContain(
      '<dt class="cg-figures__figure"><span class="cg-figures__value">38</span><span class="cg-figures__unit">%</span></dt><dd class="cg-figures__label">fewer questions at the desk</dd>',
    )
  })

  it('writes no unit element for a figure without one', () => {
    expect(html).toContain(
      '<dt class="cg-figures__figure"><span class="cg-figures__value">16</span></dt>',
    )
  })

  it('counts its figures, at most four, for the stylesheet', () => {
    expect(html).toContain('data-count="2"')
    const many = {
      ...BLOCKS.stats,
      items: Array.from({ length: 6 }, (_, i) => ({ _key: `s${i}`, value: String(i), label: 'x' })),
    }
    expect(serialize(renderStats(many, ctx))).toContain('data-count="4"')
  })

  it('carries its title as a label', () => {
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">Since 2011</h2>')
  })
})
