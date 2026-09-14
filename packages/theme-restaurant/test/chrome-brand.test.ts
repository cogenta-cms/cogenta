import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity (contract D `theme@1.3`) reaching this theme's own chrome. */

const BASE: ChromeInput = {
  site: { name: 'Maison Verte' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [],
  brandingHtml: '',
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 220, height: 48, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'Maison Verte',
  logo: source('/_image?id=light&w=440'),
  logoDark: source('/_image?id=dark&w=440'),
  faviconUrl: null,
}

describe('the brand mark', () => {
  it('sets the restaurant’s name as the home link when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cr-header__brand" href="/"')
    expect(header).toContain('<span class="cr-header__wordmark">Maison Verte</span>')
    expect(header).not.toContain('cr-header__logo')
  })

  it('puts the uploaded logo in the header instead of the name, still named and linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cr-header__logo"')
    expect(header).toContain('alt="Maison Verte"')
    expect(header).not.toContain('cr-header__wordmark')
  })

  it('offers the dark variant rather than choosing one server-side', () => {
    expect(renderChrome({ ...BASE, brand: BRAND }).header).toContain(
      'media="(prefers-color-scheme: dark)"',
    )
  })

  it('keeps the restaurant’s name in text in the footer, even with a logo', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<a class="cr-footer__name" href="/">Maison Verte</a>')
    expect(footer).not.toContain('cr-header__logo')
  })
})
