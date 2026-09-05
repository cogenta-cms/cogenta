import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('statCounter', () => {
  it('renders a real description list, figure as dd and label as dt', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toMatch(/<dd class="cg-tally__value">32<\/dd>/)
    expect(html).toMatch(/<dt class="cg-tally__label">Years cooking together<\/dt>/)
  })

  it('renders no title heading at all when the block has none', () => {
    const { title: _t, ...untitled } = BLOCKS.statCounter
    const html = serialize(renderStatCounter(untitled, ctx))
    expect(html).not.toContain('cg-tallies__title')
  })

  it('is marked with data-block="statCounter"', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('data-block="statCounter"')
  })
})
