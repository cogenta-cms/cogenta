import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('statCounter — the impact band', () => {
  it('renders a real <dl>, label before figure in markup', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('data-block="statCounter"')
    const dtIndex = html.indexOf('Posts published')
    const ddIndex = html.indexOf('>412<')
    expect(ddIndex).toBeGreaterThan(dtIndex)
  })

  it('renders every declared figure', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('8,300')
    expect(html).toContain('Weekly readers')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.statCounter
    const html = serialize(renderStatCounter(noTitle, ctx))
    expect(html).not.toContain('cg-kpis__title')
  })
})
