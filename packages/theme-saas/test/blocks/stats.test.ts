import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStats(BLOCKS.stats, ctx))

describe('stats', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('is a description list: each label names its figure, and is read first', () => {
    expect(html).toContain('<dl class="cs-figures__items">')
    expect(html).toMatch(
      /<dt class="cs-figures__label">median time to approve<\/dt><dd class="cs-figures__value">/,
    )
  })

  it('keeps the figure exactly as written and sets its unit beside it', () => {
    expect(html).toContain(
      '<span class="cs-figures__number">99.99</span><span class="cs-figures__unit">%</span>',
    )
  })

  it('renders a figure without a unit without an empty unit', () => {
    const bare = serialize(
      renderStats(
        { ...BLOCKS.stats, items: [{ _key: 'x', value: '1,400', label: 'customers' }] },
        ctx,
      ),
    )
    expect(bare).not.toContain('cs-figures__unit')
    expect(bare).toContain('data-count="1"')
  })

  it('titles the row at h2 and counts its figures for the stylesheet', () => {
    expect(html).toContain(
      '<h2 class="cs-head__title" data-field="title">Across every workspace, last quarter</h2>',
    )
    expect(html).toContain('data-count="2"')
  })
})
