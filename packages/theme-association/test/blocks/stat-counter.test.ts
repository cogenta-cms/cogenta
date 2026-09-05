import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('statCounter — "Since 1994"', () => {
  it('renders as a description list', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<dl class="cg-stat-counters__items">')
  })

  it('renders the label before the figure in the markup', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    const dtIndex = html.indexOf('<dt')
    const ddIndex = html.indexOf('<dd')
    expect(dtIndex).toBeLessThan(ddIndex)
  })

  it('renders every counter and its label, with no unit field', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('32')
    expect(html).toContain('years serving the community')
    expect(html).toContain('4')
    expect(html).toContain('programmes running today')
  })
})
