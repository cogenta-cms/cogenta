import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogos(BLOCKS.logos, ctx))

describe('logos', () => {
  it('names a mark with no alt text by its organisation', () => {
    expect(html).toContain('alt="Ashworth College"')
    expect(html).toContain('alt="The Linden Trust"')
  })

  it('links a partner that has a site, with the external-link protection', () => {
    expect(html).toContain(
      '<a class="ca-partners__cell" href="https://college.example" rel="noopener noreferrer">',
    )
  })

  it('keeps a partner without a site as an unlinked cell', () => {
    expect(html).toContain('<span class="ca-partners__cell"><img class="ca-mark"')
  })

  it('titles the block at h2', () => {
    expect(html).toContain('<h2 class="ca-head__title" data-field="title">')
  })
})
