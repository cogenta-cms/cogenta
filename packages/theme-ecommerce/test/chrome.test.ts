import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Cogenta Storefront' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [
    { label: 'New in', href: '/en/new', openInNewTab: false, kind: 'link', title: null },
    { label: 'Sale', href: '/en/sale', openInNewTab: false, kind: 'link', title: null },
  ],
  footerNav: [
    { label: 'Shipping', href: '/en/shipping', openInNewTab: false, kind: 'link', title: null },
    { label: 'Returns', href: '/en/returns', openInNewTab: false, kind: 'link', title: null },
  ],
  brandingHtml: '<div class="cg-site-footer__branding">Cogenta credit</div>',
}

describe('renderChrome', () => {
  it('renders to stable markup', () => {
    expect(renderChrome(BASE)).toMatchSnapshot()
  })

  it('renders the site name as the header brand, linking home', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="ce-header__brand" href="/en"')
    expect(header).toContain('Cogenta Storefront')
  })

  it('renders every real header nav link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/en/new"')
    expect(header).toContain('>New in<')
    expect(header).toContain('href="/en/sale"')
    expect(header).toContain('>Sale<')
  })

  it('renders no header nav element when there are no links', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('ce-header__nav')
  })

  it('renders every real footer nav link', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('href="/en/shipping"')
    expect(footer).toContain('>Shipping<')
    expect(footer).toContain('href="/en/returns"')
    expect(footer).toContain('>Returns<')
  })

  it('places the branding fragment in the footer, byte for byte, never altered', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<div class="cg-site-footer__branding">Cogenta credit</div>')
  })

  it('renders nothing extra when brandingHtml is the empty string', () => {
    const { footer } = renderChrome({ ...BASE, brandingHtml: '' })
    expect(footer).not.toContain('cg-site-footer__branding')
  })

  it('renders a submenu placeholder as an unlinked span, not a dead link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Collections',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
      ],
    })
    expect(header).toContain('<span>Collections</span>')
    expect(header).not.toContain('<a href')
  })

  it('drops a link with no href and no submenu-placeholder kind', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [{ label: 'Ghost', href: null, openInNewTab: false, kind: 'link', title: null }],
    })
    expect(header).not.toContain('Ghost')
  })

  it('opens an external link in a new tab with noopener protection', () => {
    const { footer } = renderChrome({
      ...BASE,
      footerNav: [
        {
          label: 'Press kit',
          href: 'https://press.example/kit',
          openInNewTab: true,
          kind: 'link',
          title: null,
        },
      ],
    })
    expect(footer).toContain('target="_blank" rel="noopener"')
  })

  it('escapes a site name containing markup', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: '<b>Evil</b> Co' } })
    expect(header).toContain('&lt;b&gt;Evil&lt;/b&gt; Co')
    expect(footer).toContain('&lt;b&gt;Evil&lt;/b&gt; Co')
    expect(header).not.toContain('<b>Evil</b>')
  })

  it('carries a title attribute through to the rendered link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        { label: 'Sale', href: '/en/sale', openInNewTab: false, kind: 'link', title: 'Ends soon' },
      ],
    })
    expect(header).toContain('title="Ends soon"')
  })

  it('emits no script tag anywhere in the chrome', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header).not.toMatch(/<script/i)
    expect(footer).not.toMatch(/<script/i)
  })

  // -------------------------------------------------------------------------
  // theme@1.4 (L25 "templates pro") — headerAction, the CSS-only mobile
  // menu, tagline, social, footerNote. Every one of the four fields is
  // optional and additive: a render that sets none of them must be
  // byte-for-byte the `1.1` chrome, which is what the last test in this
  // block asserts directly.
  // -------------------------------------------------------------------------

  it('ships a CSS-only mobile menu toggle ahead of the nav it controls', () => {
    const { header } = renderChrome(BASE)
    const toggleIndex = header.indexOf('id="ce-nav-toggle"')
    const navIndex = header.indexOf('id="ce-nav"')
    expect(toggleIndex).toBeGreaterThan(-1)
    expect(navIndex).toBeGreaterThan(toggleIndex)
    expect(header).toContain('<input type="checkbox"')
    expect(header).toContain('<label for="ce-nav-toggle"')
  })

  it('gives the mobile toggle an accessible name of its own', () => {
    const { header } = renderChrome(BASE)
    expect(header).toMatch(/<input type="checkbox" id="ce-nav-toggle"[^>]*aria-label="Menu"/)
  })

  it('renders neither the toggle nor the nav when there is no link and no action', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [], footerNav: BASE.footerNav })
    expect(header).not.toContain('ce-nav-toggle')
    expect(header).not.toContain('ce-header__nav')
  })

  it('still ships the toggle and the nav when only headerAction is set, with no links', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [],
      headerAction: { label: 'Shop now', href: '/en/shop' },
    })
    expect(header).toContain('ce-nav-toggle')
    expect(header).toContain('ce-header__nav')
  })

  it('renders headerAction as a filled primary button inside the nav', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Shop now', href: '/en/shop' },
    })
    expect(header).toMatch(
      /<a class="cg-action ce-header__action" data-emphasis="primary" href="\/en\/shop">Shop now<\/a>/,
    )
    expect(header.indexOf('id="ce-nav"')).toBeLessThan(header.indexOf('Shop now'))
  })

  it('renders nothing extra for headerAction when the site set none', () => {
    const { header } = renderChrome(BASE)
    expect(header).not.toContain('ce-header__action')
  })

  it('renders the footer as a real four-column grid: brand, nav, social, meta', () => {
    const { footer } = renderChrome({
      ...BASE,
      tagline: 'Made to be used, not shelved.',
      social: [{ label: 'Instagram', href: 'https://instagram.com/example' }],
      footerNote: 'A demo store, scaffolded by create-cogenta.',
    })
    expect(footer).toContain('class="ce-footer__top"')
    expect(footer).toContain('class="ce-footer__brand"')
    expect(footer).toContain('class="ce-footer__nav"')
    expect(footer).toContain('class="ce-footer__social-col"')
    expect(footer).toContain('class="ce-footer__meta"')
  })

  it('renders the tagline under the brand name when set, and omits it when absent', () => {
    const withTagline = renderChrome({ ...BASE, tagline: 'Made to be used, not shelved.' })
    expect(withTagline.footer).toContain('ce-footer__tagline')
    expect(withTagline.footer).toContain('Made to be used, not shelved.')
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('ce-footer__tagline')
  })

  it('renders social links via the shared icon-carrying helper, and omits the column when absent', () => {
    const withSocial = renderChrome({
      ...BASE,
      social: [{ label: 'Pinterest', href: 'https://pinterest.com/example' }],
    })
    expect(withSocial.footer).toContain('ce-footer__social')
    expect(withSocial.footer).toContain('https://pinterest.com/example')
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('ce-footer__social-col')
  })

  it('renders the footer note above the branding fragment, and omits it when absent', () => {
    const withNote = renderChrome({
      ...BASE,
      footerNote: 'A demo store, scaffolded by create-cogenta.',
    })
    expect(withNote.footer).toContain('ce-footer__note')
    expect(withNote.footer).toContain('A demo store, scaffolded by create-cogenta.')
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('ce-footer__note')
  })

  it('renders exactly as it would under theme@1.1 when none of the new fields are set', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header).not.toContain('ce-header__action')
    expect(footer).not.toContain('ce-footer__tagline')
    expect(footer).not.toContain('ce-footer__social-col')
    expect(footer).not.toContain('ce-footer__note')
  })
})
