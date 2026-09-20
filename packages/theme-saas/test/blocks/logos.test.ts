import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogos(BLOCKS.logos, ctx))

describe('logos', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('names each organisation through its image when the media library has no alt text', () => {
    expect(html).toContain('alt="Halvorsen Freight"')
    expect(html).toContain('alt="Brightwell Clinics"')
  })

  it('links an organisation with an address, and leaves one without as a picture', () => {
    expect(html).toMatch(
      /<a class="cs-logos__link" href="https:\/\/halvorsen\.example" aria-label="Halvorsen Freight" rel="noopener"><img/,
    )
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it('marks every wordmark so the stylesheet can grey it on white and invert it in the dark', () => {
    expect(html.match(/class="cs-logos__image cs-mark"/g)).toHaveLength(2)
  })

  it('titles the grid at h2', () => {
    expect(html).toContain('<h2 class="cs-head__title" data-field="title">Customers</h2>')
  })

  // Contract B: the organisation's name "is also the accessible name of the
  // link". It reached `image()` as `altFrom`, which is only the *fallback*
  // used when the media library has no alt text — so for a logo that did have
  // one, the link announced a photo's description instead of the organisation.
  it('names the link after the organisation, not after the picture inside it', () => {
    expect(html).toContain('aria-label="Halvorsen Freight"')
  })
})
