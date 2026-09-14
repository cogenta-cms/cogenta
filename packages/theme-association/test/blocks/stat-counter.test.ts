import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

const YEARS = {
  ...BLOCKS.statCounter,
  title: 'Since 1994',
  stats: [
    { _key: 'y1', value: '1994', label: 'The first van of hot meals' },
    { _key: 'y2', value: '312', label: 'Volunteers today' },
  ],
}

describe('statCounter', () => {
  it('reads a set of percentages that make a whole as a breakdown of it', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('data-shape="breakdown"')
    expect(html).toContain('<dl class="ca-shares" aria-label="Share of the total">')
    expect(html.match(/class="ca-shares__bar"/g)).toHaveLength(3)
  })

  it('hides each bar from assistive technology: the figure beside it says the same', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<dd class="ca-shares__track" aria-hidden="true">')
  })

  it('sets other figures as one row, each over its label', () => {
    const html = serialize(renderStatCounter(YEARS, ctx))
    expect(html).toContain('data-shape="row"')
    expect(html).toContain('<dd class="ca-counter__value">1994</dd>')
    expect(html).not.toContain('ca-shares')
  })

  it('does not take percentages that fall short of a whole for a breakdown', () => {
    const partial = {
      ...YEARS,
      stats: [
        { _key: 'p1', value: '40%', label: 'Food' },
        { _key: 'p2', value: '20%', label: 'Hall' },
      ],
    }
    expect(serialize(renderStatCounter(partial, ctx))).toContain('data-shape="row"')
  })
})
