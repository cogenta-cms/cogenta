import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (audit 2026-09-01 §7 T01). */

const BASE: ChromeInput = {
  site: { name: 'Cogenta Storefront' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [],
  footerNav: [],
  brandingHtml: '',
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 240, height: 56, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'Cogenta Storefront',
  logo: source('/_image?id=light&w=480'),
  logoDark: null,
  faviconUrl: null,
}

describe('renderChrome — shop logo', () => {
  it('renders the shop name as the header brand when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="ce-header__brand" href="/en"')
    expect(header).toContain('Cogenta Storefront')
    expect(header).not.toContain('ce-header__logo')
  })

  it('puts the uploaded logo in the header bar, still named and still linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="ce-header__logo"')
    expect(header).toContain('alt="Cogenta Storefront"')
    expect(header).toContain('class="ce-header__brand" href="/en"')
  })

  it('keeps the shop name in the footer and the bottom bar', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('class="ce-footer__copy">Cogenta Storefront<')
    expect(footer).not.toContain('ce-header__logo')
  })
})
