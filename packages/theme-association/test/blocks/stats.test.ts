import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStats(BLOCKS.stats, ctx))

describe('stats, figures with their context', () => {
  it('renders a description list, the sentence of context before the figure in reading order', () => {
    expect(html).toContain('<dl class="ca-figures__items">')
    expect(html.indexOf('<dt')).toBeLessThan(html.indexOf('<dd'))
  })

  it('sets the unit apart from the figure, and no unit where there is none', () => {
    expect(html).toContain(
      '<dd class="ca-figures__value">7,280<span class="ca-figures__unit">parcels</span></dd>',
    )
    expect(html).toContain('<dd class="ca-figures__value">312</dd>')
  })

  it('keeps the whole sentence of context as the label', () => {
    expect(html).toContain(
      '<dt class="ca-figures__label">of food handed out on Thursday evenings.</dt>',
    )
  })

  it('draws percentages that make a whole as shares of it, with a bar each', () => {
    const shares = serialize(
      renderStats(
        {
          ...BLOCKS.stats,
          items: [
            { _key: 'a', value: '62', unit: '%', label: 'Food' },
            { _key: 'b', value: '38%', label: 'Everything else' },
          ],
        },
        ctx,
      ),
    )
    expect(shares).toContain('data-shape="breakdown"')
    expect(shares).toContain('<data value="62">62%</data>')
    expect(shares).toContain('style="inline-size:38%"')
  })

  it('keeps figures that are not shares of one whole as figures', () => {
    expect(html).toContain('data-shape="figures"')
  })

  it('omits the title entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.stats
    const bare = serialize(renderStats(noTitle, ctx))
    expect(bare).not.toContain('ca-head')
    expect(bare).toContain('data-titled="false"')
  })
})
