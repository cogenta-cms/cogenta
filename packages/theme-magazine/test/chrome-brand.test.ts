import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (audit 2026-09-01 §7 T01). */

const BASE: ChromeInput = {
  site: { name: 'The Composing Room' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [],
  footerNav: [],
  brandingHtml: '',
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 400, height: 80, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'The Composing Room',
  logo: source('/_image?id=light&w=800'),
  logoDark: null,
  faviconUrl: null,
}

describe('renderChrome — site logo', () => {
  it('sets the nameplate in type when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<a class="cg-masthead__wordmark" href="/en">The Composing Room</a>')
    expect(header).not.toContain('cg-masthead__logo')
  })

  it('sets the uploaded logo as the nameplate, at nameplate scale, still named', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cg-masthead__logo"')
    expect(header).toContain('alt="The Composing Room"')
    // Still inside the nameplate anchor, so the masthead still links home.
    expect(header).toContain('<a class="cg-masthead__wordmark" href="/en">')
  })

  it('keeps the colophon wordmark in text', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('The Composing Room')
    expect(footer).not.toContain('cg-masthead__logo')
  })
})
