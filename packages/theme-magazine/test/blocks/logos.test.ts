import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogos(BLOCKS.logos, ctx))

describe('renderLogos, marks credited by name', () => {
  it('names each mark with its organisation when the media entity has no alt text', () => {
    expect(html).toContain('alt="Acme Trade Weekly"')
    expect(html).toContain('alt="Globex Review"')
  })

  it('links a mark that has a URL, with the external-link protection', () => {
    expect(html).toMatch(
      /<a class="cg-marks__link" href="https:\/\/acme\.example" rel="noopener noreferrer"><img class="cg-marks__image"/,
    )
  })

  it('sets a mark without a URL as a plain image', () => {
    expect(html).toMatch(
      /<li class="cg-marks__item"><img class="cg-marks__image"[^>]*alt="Globex Review"/,
    )
  })

  it('counts its marks for the stylesheet, between three and six columns', () => {
    expect(html).toContain('data-count="3"')
    const many = {
      ...BLOCKS.logos,
      items: Array.from({ length: 9 }, (_, i) => ({
        _key: `m${i}`,
        media: 'logo-acme',
        name: `Org ${i}`,
      })),
    }
    expect(serialize(renderLogos(many, ctx))).toContain('data-count="6"')
  })

  it('opens on the shared section head', () => {
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">As seen in</h2>')
  })
})
