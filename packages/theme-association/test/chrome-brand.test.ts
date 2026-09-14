import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (contract D `theme@1.3`). */

const BASE: ChromeInput = {
  site: { name: 'Common Ground' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [],
  brandingHtml: '',
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 200, height: 48, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'Common Ground',
  logo: source('/_image?id=light&w=400'),
  logoDark: source('/_image?id=dark&w=400'),
  faviconUrl: null,
}

describe('renderChrome, site logo', () => {
  it('renders the site name as text when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<span class="ca-header__wordmark">Common Ground</span>')
  })

  it('shows the uploaded logo instead of the wordmark, still named and still linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="ca-header__logo"')
    expect(header).toContain('alt="Common Ground"')
    expect(header).toContain('<a class="ca-header__brand" href="/">')
    expect(header).not.toContain('ca-header__wordmark')
  })

  it('offers the dark logo through prefers-color-scheme rather than picking one server-side', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('media="(prefers-color-scheme: dark)"')
    expect(header).toContain('id=dark')
    expect(header).toContain('id=light')
  })

  it('keeps the site name in the footer, so a page whose logo fails still names the site', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<a class="ca-footer__name" href="/">Common Ground</a>')
  })
})
