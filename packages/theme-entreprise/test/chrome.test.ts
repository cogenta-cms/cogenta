import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Cogenta Advisory' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Services', href: '/services', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Insights', href: '/insights', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Contact', href: '/contact', openInNewTab: false, kind: 'internal', title: null },
  ],
  footerNav: [
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Terms', href: '/terms', openInNewTab: false, kind: 'internal', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

describe('renderChrome', () => {
  it('renders the real site name as the home link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cg-site-header__home" href="/"')
    expect(header).toContain('Cogenta Advisory')
  })

  it('renders every header link but the last as an ordinary nav item', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/services"')
    expect(header).toContain('>Services<')
    expect(header).toContain('href="/insights"')
  })

  it('sets the last header link apart as the primary call to action', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('cg-nav__divider')
    expect(header).toMatch(/<a class="cg-nav__cta" href="\/contact">Contact<\/a>/)
    // The CTA link itself must not also appear inside the ordinary nav list.
    const navItemsEnd = header.indexOf('</ul>')
    expect(header.slice(0, navItemsEnd)).not.toContain('/contact')
  })

  it('renders no divider or CTA treatment when there are fewer than two links', () => {
    const single: ChromeInput['headerNav'] = [
      { label: 'Services', href: '/services', openInNewTab: false, kind: 'internal', title: null },
    ]
    const { header } = renderChrome({ ...BASE, headerNav: single })
    expect(header).not.toContain('cg-nav__divider')
    expect(header).not.toContain('cg-nav__cta')
    expect(header).toContain('>Services<')
  })

  it('renders no nav element at all when there are no header links', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('<nav')
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

  it('renders the footer as a real multi-column grid: brand, nav, branding', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('class="cg-site-footer__grid"')
    expect(footer).toContain('class="cg-site-footer__brand"')
    expect(footer).toContain('class="cg-site-footer__nav"')
    expect(footer).toContain('class="cg-site-footer__branding"')
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
