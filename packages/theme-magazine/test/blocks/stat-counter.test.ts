import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderStatCounter', () => {
  it('renders a definition list, one entry per stat', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<dl class="cg-tally__items">')
    expect(html).toContain('<dd class="cg-tally__value">4</dd>')
    expect(html).toContain('<dt class="cg-tally__label">Working machines</dt>')
  })

  it('never renders a unit, unlike stats', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).not.toContain('cg-figures__unit')
    expect(html).not.toContain('cg-tally__unit')
  })

  it('omits the block title when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.statCounter
    const html = serialize(renderStatCounter(untitled, ctx))
    expect(html).not.toContain('cg-tally__title')
  })

  it('renders every stat of the block', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('1928')
    expect(html).toContain('Founding year')
  })
})
