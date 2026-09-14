import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.statCounter): string => serialize(renderStatCounter(block, ctx))

describe('statCounter, the figures a page wants remembered', () => {
  it('renders a real <dl>, label before figure in markup', () => {
    expect(html()).toContain(
      '<div class="cg-tally__item"><dt class="cg-tally__label">Pages of drafts</dt><dd class="cg-tally__value">1,240</dd></div>',
    )
  })

  it('renders every declared figure', () => {
    expect(html().match(/<dd class="cg-tally__value">/g)).toHaveLength(2)
  })

  it('says how many figures it holds, capped at four columns', () => {
    expect(html()).toContain('data-count="2"')
  })

  it('omits the section head entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.statCounter
    expect(html(untitled)).not.toContain('cg-head')
  })
})
