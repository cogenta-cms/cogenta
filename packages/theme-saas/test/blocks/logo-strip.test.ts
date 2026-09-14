import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))

describe('logoStrip', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('sets the caption above the marks, never under them', () => {
    expect(html.indexOf('cs-strip__caption')).toBeLessThan(html.indexOf('cs-strip__items'))
    expect(html).toContain(
      '<p class="cs-strip__caption" data-field="caption">Finance teams at 1,400 companies approve spend here</p>',
    )
  })

  it('lists one picture per mark, marked for the monochrome treatment, and links none', () => {
    expect(
      html.match(/<li class="cs-strip__item"><img class="cs-strip__image cs-mark"/g),
    ).toHaveLength(3)
    expect(html).not.toContain('<a ')
  })

  it('counts its marks for the stylesheet', () => {
    expect(html).toContain('data-count="3"')
  })

  it('renders a strip without a caption with no empty paragraph', () => {
    const { caption: _c, ...bare } = BLOCKS.logoStrip
    expect(serialize(renderLogoStrip(bare, ctx))).not.toContain('<p')
  })
})
