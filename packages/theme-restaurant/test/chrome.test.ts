import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Amaranthe' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Menu', href: '/menu', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Our story', href: '/about', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Gallery', href: '/gallery', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Contact', href: '/contact', openInNewTab: false, kind: 'internal', title: null },
  ],
  footerNav: [
    { label: 'Menu', href: '/menu', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Reservations', href: '/contact', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'internal', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
  headerAction: { label: 'Reserve', href: '/contact' },
  tagline: 'Seasonal cooking, since 1994.',
  social: [
    { label: 'Instagram', href: 'https://instagram.com/example' },
    { label: 'Facebook', href: 'https://facebook.com/example' },
  ],
  footerNote: '12 Market Street · +33 0 00 00 00 00',
}

describe('renderChrome', () => {
  it('renders the real site name as the home link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cg-site-header__home" href="/"')
    expect(header).toContain('Amaranthe')
  })

  it('renders every header link as an ordinary nav item, in the desktop nav', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/menu"')
    expect(header).toContain('>Menu<')
    expect(header).toContain('href="/about"')
  })

  it('renders the header action as a distinct button, never inside the nav list', () => {
    const { header } = renderChrome(BASE)
    expect(header).toMatch(
      /<a class="cg-action cg-nav__cta" data-emphasis="primary" href="\/contact">Reserve<\/a>/,
    )
    const desktopNavEnd = header.indexOf('</nav>')
    expect(header.slice(0, desktopNavEnd)).not.toContain('cg-nav__cta')
  })

  it('renders no header action markup when none is configured', () => {
    const { headerAction: _omit, ...withoutAction } = BASE
    const { header } = renderChrome(withoutAction)
    expect(header).not.toContain('cg-nav__cta')
  })

  it('renders no nav element at all when there are no header links', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toMatch(/<nav class="cg-nav"/)
  })

  it('renders a CSS-only mobile menu carrying the same links, in a <details> disclosure', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<details class="cg-mobile-nav">')
    expect(header).toContain('<summary class="cg-mobile-nav__toggle"')
    const panel = header.slice(header.indexOf('cg-mobile-nav__panel'))
    expect(panel).toContain('href="/menu"')
    expect(panel).toContain('href="/contact"')
  })

  it('renders no mobile menu at all when there is nothing to show', () => {
    const { headerAction: _omit, ...withoutAction } = BASE
    const { header } = renderChrome({ ...withoutAction, headerNav: [] })
    expect(header).not.toContain('cg-mobile-nav')
  })

  it('renders every footer link', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('href="/privacy"')
    expect(footer).toContain('href="/contact"')
  })

  it('places the branding fragment inside the footer, unmodified', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<a href="https://cogenta.dev">Made with Cogenta</a>')
  })

  it('renders the footer as a real multi-column grid: brand, nav, about', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('class="cg-site-footer__grid"')
    expect(footer).toContain('class="cg-site-footer__brand"')
    expect(footer).toContain('class="cg-site-footer__nav"')
    expect(footer).toContain('class="cg-site-footer__about"')
  })

  it('renders the tagline under the brand name', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('cg-site-footer__tagline')
    expect(footer).toContain('Seasonal cooking, since 1994.')
  })

  it('renders social links as an icon row', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('instagram.com/example')
  })

  it('renders the footer note as the about column', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('cg-site-footer__note')
    expect(footer).toContain('12 Market Street')
  })

  it('renders none of the 1.4 fields when absent — pre-1.4 sites render exactly as before', () => {
    const { footer } = renderChrome({
      site: BASE.site,
      locale: BASE.locale,
      homeHref: BASE.homeHref,
      headerNav: BASE.headerNav,
      footerNav: BASE.footerNav,
      brandingHtml: BASE.brandingHtml,
    })
    expect(footer).not.toContain('cg-site-footer__tagline')
    expect(footer).not.toContain('cg-site-footer__social')
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
