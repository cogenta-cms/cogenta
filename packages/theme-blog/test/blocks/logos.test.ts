import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.logos): string => serialize(renderLogos(block, ctx))

describe('logos, a ruled row of wordmarks', () => {
  it('links a logo when the item declares a url, as an external link', () => {
    expect(html()).toMatch(
      /<a class="cg-marks__link" href="https:\/\/acme\.example" rel="noopener noreferrer"><img class="cg-marks__logo"/,
    )
  })

  it('renders an unlinked logo as a bare image', () => {
    expect(html()).toMatch(
      /<li class="cg-marks__item"><img class="cg-marks__logo"[^>]*alt="Globex"/,
    )
  })

  it('uses the organisation name as alt text when the media entity has none', () => {
    expect(html()).toContain('alt="Acme"')
  })

  it('asks the image pipeline for a contained rendition, never a crop of the mark', () => {
    expect(html()).not.toContain('object-position')
  })

  it('omits the section head entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.logos
    expect(html(untitled)).not.toContain('cg-head')
  })
})
