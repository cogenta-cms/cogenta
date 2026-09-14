import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStats(BLOCKS.stats, ctx))

describe('stats', () => {
  it('renders the figures as a description list, each label paired with its value', () => {
    expect(html).toContain('<dl class="cr-figures__items">')
    expect(html).toContain(
      '<div class="cr-figures__item"><dt class="cr-figures__label">seats in the room</dt><dd class="cr-figures__value">38</dd></div>',
    )
  })

  it('sets a unit a step smaller beside its value', () => {
    expect(html).toContain('100<span class="cr-figures__unit">km</span>')
  })

  it('counts its columns for the stylesheet, capped at four', () => {
    expect(html).toContain('data-count="2"')
    const many = serialize(
      renderStats(
        {
          ...BLOCKS.stats,
          items: Array.from({ length: 6 }, (_, index) => ({
            _key: `s${index}`,
            value: String(index),
            label: 'covers',
          })),
        },
        ctx,
      ),
    )
    expect(many).toContain('data-count="4"')
  })

  it('titles the row at h2', () => {
    expect(html).toContain(
      '<h2 class="cr-head__title" data-field="title">The house in numbers</h2>',
    )
  })

  it('never animates a number into place', () => {
    expect(html).not.toMatch(/data-count-to|counter|<script/)
  })
})
