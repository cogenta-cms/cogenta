import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const logos = serialize(renderLogos(BLOCKS.logos, ctx))
const strip = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))

describe('logos', () => {
  it('renders to stable markup', () => {
    expect(logos).toMatchSnapshot()
  })

  it('names a mark after its organisation when the media library has no alt text', () => {
    expect(logos).toContain('alt="Rossio Hardware"')
    expect(logos).toContain('alt="Marlowe &amp; Daughters"')
  })

  it('links a mark that has a url, with external protection, and leaves the other plain', () => {
    expect(logos).toContain(
      '<a class="ce-marks__plate" href="https://rossio.example" rel="noopener noreferrer">',
    )
    expect(logos).toContain('<span class="ce-marks__plate">')
  })

  it('titles the block at h2', () => {
    expect(logos).toContain('<h2 class="ce-head__title" data-field="title">Stocked by</h2>')
  })

  it('sets each mark on a plate the dark scheme can light', () => {
    expect(logos.match(/class="ce-marks__plate"/g)).toHaveLength(2)
  })
})

describe('logoStrip', () => {
  it('renders to stable markup', () => {
    expect(strip).toMatchSnapshot()
  })

  it('links nothing, per contract B', () => {
    expect(strip).not.toContain('<a ')
  })

  it('renders the caption as an editable line of text, never a heading', () => {
    expect(strip).toContain('<p class="ce-strip__caption" data-field="caption">Also sold by</p>')
    expect(strip).not.toMatch(/<h[1-6]/)
  })

  it('says whether it has a caption, for the stylesheet', () => {
    expect(strip).toContain('data-captioned="true"')
    const { caption: _caption, ...rest } = BLOCKS.logoStrip
    expect(serialize(renderLogoStrip(rest, ctx))).toContain('data-captioned="false"')
  })

  it('renders one item per mark, each with an alt attribute', () => {
    expect(strip.match(/<li class="ce-strip__item">/g)).toHaveLength(2)
    for (const tag of strip.match(/<img[^>]*>/g) ?? []) expect(tag).toMatch(/\salt="/)
  })
})
