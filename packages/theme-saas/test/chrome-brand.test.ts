import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (contract D `theme@1.3`). */

const BASE: ChromeInput = {
  site: { name: 'Ledgerline' },
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
  name: 'Ledgerline',
  logo: source('/_image?id=light&w=440'),
  logoDark: source('/_image?id=dark&w=440'),
  faviconUrl: null,
}

describe('renderChrome, corporate logo', () => {
  it('renders the site name as the home link when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cs-header__brand" href="/"')
    expect(header).toContain('<span class="cs-header__wordmark">Ledgerline</span>')
    expect(header).not.toContain('cs-header__logo')
  })

  it('puts the uploaded logo in the header instead of the name, still named and linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cs-header__logo"')
    expect(header).toContain('alt="Ledgerline"')
    expect(header).not.toContain('cs-header__wordmark')
    expect(header).toContain('class="cs-header__brand" href="/"')
  })

  it('offers the dark variant rather than choosing one server-side', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('media="(prefers-color-scheme: dark)"')
  })

  it('keeps the site name in the footer and on the legal line', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<a class="cs-footer__name" href="/">Ledgerline</a>')
    expect(footer).toMatch(/© \d{4} Ledgerline/)
  })
})
