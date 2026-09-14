import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))

describe('statCounter', () => {
  it('draws the same figures as stats, without a unit', () => {
    expect(html).toContain('<dd class="cr-figures__value">9,840</dd>')
    expect(html).not.toContain('cr-figures__unit')
  })

  it('is stamped as its own block type', () => {
    expect(html).toContain('data-block="statCounter"')
  })

  it('renders every value as static text, never a counter', () => {
    expect(html.match(/<dd class="cr-figures__value">/g)).toHaveLength(2)
    expect(html).not.toMatch(/<script|data-target/)
  })
})
