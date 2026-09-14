import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (audit 2026-09-01 §7 T01). */

const BASE: ChromeInput = {
  site: { name: 'Relay Docs' },
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
  name: 'Relay Docs',
  logo: source('/_image?id=light&w=400'),
  logoDark: source('/_image?id=dark&w=400'),
  faviconUrl: null,
}

describe('renderChrome, site logo', () => {
  it('sets the site name as a wordmark when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('cd-wordmark__product">Relay</span>')
    expect(header).not.toContain('<img')
  })

  it('shows the uploaded logo instead of the wordmark, still named and still linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cd-header__logo"')
    expect(header).toContain('alt="Relay Docs"')
    expect(header).toContain('<a class="cd-header__brand" href="/">')
    expect(header).not.toContain('cd-wordmark')
  })

  it('offers the dark logo through prefers-color-scheme rather than picking one server-side', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('media="(prefers-color-scheme: dark)"')
    expect(header).toContain('id=dark')
    expect(header).toContain('id=light')
  })

  it('keeps the site name in text in the footer, so a page whose logo fails still names the site', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<a class="cd-footer__name" href="/">Relay Docs</a>')
  })

  it('keeps the product name in the copyright line too', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('Relay</p>')
  })
})
