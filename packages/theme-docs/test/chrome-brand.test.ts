import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (audit 2026-09-01 §7 T01). */

const BASE: ChromeInput = {
  site: { name: 'Reference Site' },
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
  name: 'Reference Site',
  logo: source('/_image?id=light&w=400'),
  logoDark: source('/_image?id=dark&w=400'),
  faviconUrl: null,
}

describe('renderChrome — site logo', () => {
  it('renders the site name as text when no logo is set, exactly as before', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<a class="cg-site-header__home" href="/">Reference Site</a>')
  })

  it('shows the uploaded logo instead of the wordmark, still named and still linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cg-site-header__logo"')
    expect(header).toContain('alt="Reference Site"')
    expect(header).toContain('<a class="cg-site-header__home" href="/">')
  })

  it('offers the dark logo through prefers-color-scheme rather than picking one server-side', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('media="(prefers-color-scheme: dark)"')
    expect(header).toContain('id=dark')
    expect(header).toContain('id=light')
  })

  it('keeps the site name in text in the footer brand column, so a page whose logo fails still names the site', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<a href="/">Reference Site</a>')
  })

  it('keeps the site name in the footer legal row too', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<span>Reference Site</span>')
  })
})
