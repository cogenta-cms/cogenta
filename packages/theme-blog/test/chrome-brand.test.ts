import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/** The site identity reaching this theme's own chrome (contract D `theme@1.3`). */

const BASE: ChromeInput = {
  site: { name: 'Field Notes' },
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
  name: 'Field Notes',
  logo: source('/_image?id=light&w=440'),
  logoDark: source('/_image?id=dark&w=440'),
  faviconUrl: null,
}

describe('renderChrome — logo/wordmark', () => {
  it('renders the site name as the home link when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cg-site-header__home" href="/"')
    expect(header).toContain('Field Notes')
    expect(header).not.toContain('cg-site-header__logo')
  })

  it('puts the uploaded logo in the header, still named and still linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cg-site-header__logo"')
    expect(header).toContain('alt="Field Notes"')
    expect(header).toContain('class="cg-site-header__home" href="/"')
  })

  it('offers the dark variant rather than choosing one server-side', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('media="(prefers-color-scheme: dark)"')
  })

  it('keeps the site name in the footer brand column', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('cg-site-footer__brand')
    expect(footer).toContain('Field Notes')
  })
})
