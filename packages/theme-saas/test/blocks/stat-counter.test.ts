import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))

describe('statCounter', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('pairs every count with its label in a description list', () => {
    expect(html).toContain(
      '<dt class="cs-counters__label">customers</dt><dd class="cs-counters__value">1,400</dd>',
    )
  })

  it('draws the counts as one ruled strip distinct from the stats row', () => {
    expect(html).toContain('class="cs-section cs-counters"')
    expect(html).not.toContain('cs-figures')
  })

  it('animates nothing: the count is printed as written, with no script', () => {
    expect(html).not.toMatch(/<script|data-count-to|data-animate/)
  })

  it('caps the column count at four for the stylesheet', () => {
    const many = serialize(
      renderStatCounter(
        {
          ...BLOCKS.statCounter,
          stats: [1, 2, 3, 4, 5].map((n) => ({
            _key: `s${n}`,
            value: String(n),
            label: `label ${n}`,
          })),
        },
        ctx,
      ),
    )
    expect(many).toContain('data-count="4"')
  })
})
