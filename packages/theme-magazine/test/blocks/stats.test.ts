import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStats(BLOCKS.stats, ctx))

describe('renderStats, figures in a row', () => {
  it('uses a description list, each label announced with its value', () => {
    expect(html).toContain(
      '<div class="cg-figures__item"><dt class="cg-figures__label">Working machines</dt><dd class="cg-figures__value"><span class="cg-figures__number">4</span></dd></div>',
    )
  })

  it('sets a unit beside its number, in its own element', () => {
    expect(html).toContain(
      '<span class="cg-figures__number">112</span><span class="cg-figures__unit">yrs</span>',
    )
  })

  it('counts its figures for the stylesheet, capped at four columns', () => {
    expect(html).toContain('data-count="2"')
  })

  it('renders no head when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.stats
    expect(serialize(renderStats(untitled, ctx))).not.toContain('cg-head')
  })
})
