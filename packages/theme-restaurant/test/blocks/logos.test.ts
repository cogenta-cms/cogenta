import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogos(BLOCKS.logos, ctx))

describe('logos', () => {
  it('names each mark after its organisation when the media has no alt text', () => {
    expect(html).toContain('alt="Tablées"')
    expect(html).toContain('alt="The Rhône Guide"')
  })

  it('links a mark out with rel protection, and leaves an unlinked one as a plate', () => {
    expect(html).toContain(
      '<a class="cr-marks__plate" href="https://tablees.example" rel="noopener noreferrer">',
    )
    expect(html).toContain('<span class="cr-marks__plate">')
  })

  it('sizes marks small, whatever their source width', () => {
    expect(html.match(/sizes="10rem"/g)).toHaveLength(2)
  })

  it('titles the row at h2', () => {
    expect(html).toContain('<h2 class="cr-head__title" data-field="title">Written about in</h2>')
  })
})
