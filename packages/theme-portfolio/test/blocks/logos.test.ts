import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogos(BLOCKS.logos, ctx))

describe('renderLogos, marks on plates', () => {
  it('puts every mark on its own plate, the name under it', () => {
    expect(html.match(/class="cg-marks__plate"/g)).toHaveLength(2)
    expect(html).toContain('<p class="cg-marks__name">Globex Records</p>')
  })

  it('links a plate only when the mark has a URL, with the external link protection', () => {
    expect(html).toContain(
      '<a class="cg-marks__plate" href="https://acme.example" aria-label="Acme Concert Hall" rel="noopener noreferrer">',
    )
    expect(html).toContain('<div class="cg-marks__plate"><img')
  })

  it('names a mark with its organisation when the media library has no alt text, and keeps one it has', () => {
    expect(html).toContain('alt="Acme Concert Hall"')
    expect(html).toContain('alt="Globex Records"')
  })

  it('carries its title as a label and counts its marks', () => {
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">Clients</h2>')
    expect(html).toContain('data-count="2"')
  })

  // Contract B: the organisation's name "is also the accessible name of the
  // link". It reached `image()` as `altFrom`, which is only the *fallback*
  // used when the media library has no alt text — so for a logo that did have
  // one, the link announced a photo's description instead of the organisation.
  it('names the link after the organisation, not after the picture inside it', () => {
    expect(html).toContain('aria-label="Acme Concert Hall"')
  })
})
