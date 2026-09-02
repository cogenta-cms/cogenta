import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (audit 2026-09-01 §7 T01). */

const BASE: ChromeInput = {
  site: { name: 'Studio Cogenta' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [],
  footerNav: [],
  brandingHtml: '',
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 200, height: 48, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'Studio Cogenta',
  logo: source('/_image?id=light&w=400'),
  logoDark: null,
  faviconUrl: null,
}

describe('renderChrome — site logo', () => {
  it('keeps the typographic wordmark when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('cg-site-header__glyph')
    expect(header).toContain('Studio Cogenta')
    expect(header).not.toContain('cg-site-header__logo')
  })

  it('replaces the wordmark and its asterisk glyph with the uploaded logo', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cg-site-header__logo"')
    expect(header).toContain('src="/_image?id=light&amp;w=400"')
    // The glyph belongs to the wordmark treatment, so it goes with it.
    expect(header).not.toContain('cg-site-header__glyph')
    // The site is still named, for a screen reader and for a failed image.
    expect(header).toContain('alt="Studio Cogenta"')
  })

  it('still links the mark home, and still names the site in the footer', () => {
    const { header, footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('href="/en"')
    expect(footer).toContain('Studio Cogenta')
  })
})
