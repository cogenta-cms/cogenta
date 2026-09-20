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
      '<a class="cr-marks__plate" href="https://tablees.example" aria-label="Tablées" rel="noopener noreferrer">',
    )
    expect(html).toContain('<span class="cr-marks__plate">')
  })

  it('sizes marks small, whatever their source width', () => {
    expect(html.match(/sizes="10rem"/g)).toHaveLength(2)
  })

  it('titles the row at h2', () => {
    expect(html).toContain('<h2 class="cr-head__title" data-field="title">Written about in</h2>')
  })

  // Contract B: the organisation's name "is also the accessible name of the
  // link". It reached `image()` as `altFrom`, which is only the *fallback*
  // used when the media library has no alt text — so for a logo that did have
  // one, the link announced a photo's description instead of the organisation.
  it('names the link after the organisation, not after the picture inside it', () => {
    expect(html).toContain('aria-label="Tablées"')
  })
})
