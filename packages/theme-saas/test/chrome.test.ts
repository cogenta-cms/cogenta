import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Cogenta Cloud' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Product', href: '/product', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Pricing', href: '/pricing', openInNewTab: false, kind: 'internal', title: null },
  ],
  footerNav: [
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Terms', href: '/terms', openInNewTab: false, kind: 'internal', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

describe('renderChrome', () => {
  it('renders the site name as the home link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cg-site-header__home" href="/"')
    expect(header).toContain('Cogenta Cloud')
  })

  it('renders every header link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/product"')
    expect(header).toContain('>Product<')
    expect(header).toContain('href="/pricing"')
  })

  it('ships a CSS-only mobile menu toggle ahead of the nav it controls', () => {
    const { header } = renderChrome(BASE)
    const toggleIndex = header.indexOf('id="cg-nav-toggle"')
    const navIndex = header.indexOf('id="cg-nav"')
    expect(toggleIndex).toBeGreaterThan(-1)
    expect(navIndex).toBeGreaterThan(toggleIndex)
    expect(header).toContain('<input type="checkbox"')
    expect(header).toContain('<label for="cg-nav-toggle"')
  })

  it('gives the mobile toggle an accessible name of its own', () => {
    const { header } = renderChrome(BASE)
    expect(header).toMatch(/<input type="checkbox" id="cg-nav-toggle"[^>]*aria-label="Menu"/)
  })

  it('renders no nav element at all when there are no header links and no action', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('<ul class="cg-menu">')
  })

  it('renders headerAction as a filled primary button inside the nav', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Start free', href: '/signup' },
    })
    expect(header).toMatch(
      /<a class="cg-action cg-site-header__action" data-emphasis="primary" href="\/signup">Start free<\/a>/,
    )
    expect(header.indexOf('id="cg-nav"')).toBeLessThan(header.indexOf('Start free'))
  })

  it('renders nothing extra for headerAction when the site set none', () => {
    const { header } = renderChrome(BASE)
    expect(header).not.toContain('cg-site-header__action')
  })

  it('renders every footer link', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('href="/privacy"')
    expect(footer).toContain('href="/terms"')
  })

  it('places the branding fragment inside the footer, unmodified', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<a href="https://cogenta.dev">Made with Cogenta</a>')
  })

  it('renders the footer as a real four-column grid: brand, nav, social, branding', () => {
    const { footer } = renderChrome({
      ...BASE,
      tagline: 'Ship faster, with less friction.',
      social: [{ label: 'X', href: 'https://x.com/example' }],
      footerNote: 'A demo SaaS site.',
    })
    expect(footer).toContain('class="cg-site-footer__grid"')
    expect(footer).toContain('class="cg-site-footer__brand"')
    expect(footer).toContain('class="cg-site-footer__nav"')
    expect(footer).toContain('class="cg-site-footer__social-col"')
    expect(footer).toContain('class="cg-site-footer__branding"')
  })

  it('renders the tagline under the brand name when set, and omits it when absent', () => {
    const withTagline = renderChrome({ ...BASE, tagline: 'Ship faster, with less friction.' })
    expect(withTagline.footer).toContain('cg-site-footer__tagline')
    expect(withTagline.footer).toContain('Ship faster, with less friction.')
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('cg-site-footer__tagline')
  })

  it('renders social links via the shared icon-carrying helper, and omits the column when absent', () => {
    const withSocial = renderChrome({
      ...BASE,
      social: [{ label: 'GitHub', href: 'https://github.com/example' }],
    })
    expect(withSocial.footer).toContain('cg-site-footer__social')
    expect(withSocial.footer).toContain('https://github.com/example')
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('cg-site-footer__social-col')
  })

  it('renders the footer note, and omits it when absent', () => {
    const withNote = renderChrome({ ...BASE, footerNote: 'A demo SaaS site.' })
    expect(withNote.footer).toContain('cg-site-footer__note')
    expect(withNote.footer).toContain('A demo SaaS site.')
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('cg-site-footer__note')
  })

  it('renders exactly as it would under theme@1.3 when none of the new fields are set', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header).not.toContain('cg-site-header__action')
    expect(footer).not.toContain('cg-site-footer__tagline')
    expect(footer).not.toContain('cg-site-footer__social-col')
    expect(footer).not.toContain('cg-site-footer__note')
  })

  it('escapes a site name that contains markup-significant characters', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: 'A & B <Co>' } })
    expect(header).toContain('A &amp; B &lt;Co&gt;')
    expect(footer).toContain('A &amp; B &lt;Co&gt;')
    expect(header).not.toContain('<Co>')
  })

  it('renders an unlinked submenu placeholder as a span, never a dead link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'More',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
        ...BASE.headerNav,
      ],
    })
    expect(header).toContain('<span>More</span>')
  })

  it('opens an external link in a new tab with rel="noopener"', () => {
    const { footer } = renderChrome({
      ...BASE,
      footerNav: [
        {
          label: 'GitHub',
          href: 'https://github.com/cogenta-cms',
          openInNewTab: true,
          kind: 'external',
          title: null,
        },
      ],
    })
    expect(footer).toMatch(
      /<a href="https:\/\/github\.com\/cogenta-cms" target="_blank" rel="noopener">GitHub<\/a>/,
    )
  })

  it('emits no script tag anywhere in the chrome', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header).not.toMatch(/<script/i)
    expect(footer).not.toMatch(/<script/i)
  })
})
