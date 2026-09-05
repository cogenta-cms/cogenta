import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/**
 * `theme@1.4` (L25 D2) — `tagline`/`social`/`footerNote`/`headerAction`, all
 * optional and additive; plus this theme's own CSS-only mobile disclosure.
 */

const BASE: ChromeInput = {
  site: { name: 'Riverside Community Fund' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Programmes', href: '/programmes', openInNewTab: false, kind: 'url', title: null },
    { label: 'Events', href: '/events', openInNewTab: false, kind: 'url', title: null },
  ],
  footerNav: [
    { label: 'Events', href: '/events', openInNewTab: false, kind: 'url', title: null },
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'url', title: null },
  ],
  brandingHtml: '<div class="cg-site-footer__branding">credit</div>',
}

describe('renderChrome — header', () => {
  it('renders the site name as the home link when no logo is set', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<a class="cg-site-header__home" href="/">Riverside Community Fund</a>',
    )
  })

  it('renders the same nav links once in the desktop row and once inside the mobile disclosure', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('cg-nav--desktop')
    expect(header).toContain('cg-nav--mobile')
    expect(header.match(/href="\/programmes"/g)?.length).toBe(2)
    expect(header.match(/href="\/events"/g)?.length).toBe(2)
  })

  it('wraps the mobile nav in a zero-JavaScript <details>/<summary> disclosure', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<details class="cg-nav-toggle">')
    expect(header).toContain('<summary class="cg-nav-toggle__button"')
  })

  it('omits the mobile disclosure entirely when there is no header nav', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('cg-nav-toggle')
  })

  it('renders the header action as a primary-styled button after the nav', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Donate', href: '/donate' },
    })
    expect(header).toContain('data-emphasis="primary"')
    expect(header).toContain('cg-site-header__action')
    expect(header).toContain('href="/donate"')
    expect(header).toContain('>Donate<')
  })

  it('escapes a hostile header action label and href', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: '<script>x</script>', href: '"onmouseover=x' },
    })
    expect(header).not.toContain('<script>x')
    expect(header).not.toContain('"onmouseover=x')
  })

  it('emits no script tag anywhere in the header', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Donate', href: '/donate' },
    })
    expect(header).not.toMatch(/<script/i)
  })
})

describe('renderChrome — footer (theme@1.4 fields)', () => {
  it('renders a complete footer with none of the four new fields set', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('Riverside Community Fund')
    expect(footer).toContain('cg-site-footer__grid')
    expect(footer).toContain('credit')
  })

  it('shows the tagline under the site name', () => {
    const { footer } = renderChrome({ ...BASE, tagline: 'Working together, close to home.' })
    expect(footer).toContain('cg-site-footer__tagline')
    expect(footer).toContain('Working together, close to home.')
  })

  it('escapes a hostile tagline', () => {
    const { footer } = renderChrome({ ...BASE, tagline: '<script>alert(1)</script>' })
    expect(footer).not.toContain('<script>alert')
    expect(footer).toContain('&lt;script&gt;')
  })

  it('renders the social links as an icon list, one column of the footer grid', () => {
    const { footer } = renderChrome({
      ...BASE,
      social: [
        { label: 'Facebook', href: 'https://facebook.com/riverside' },
        { label: 'Instagram', href: 'https://instagram.com/riverside' },
      ],
    })
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('cg-visually-hidden')
    expect(footer.match(/<svg/g)?.length).toBe(2)
  })

  it('omits the social markup entirely when social is absent', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).not.toContain('cg-site-footer__social')
  })

  it('renders the footer note as its own column, escaped', () => {
    const { footer } = renderChrome({
      ...BASE,
      footerNote: 'Registered charity 1029384. 220 Elm Street.',
    })
    expect(footer).toContain('cg-site-footer__note')
    expect(footer).toContain('Registered charity 1029384.')
  })

  it('places brandingHtml exactly once, unaltered', () => {
    const { footer } = renderChrome(BASE)
    expect(footer.match(/cg-site-footer__branding/g)?.length).toBe(1)
    expect(footer).toContain('<div class="cg-site-footer__branding">credit</div>')
  })

  it('renders all four fields together without interfering with one another', () => {
    const { header, footer } = renderChrome({
      ...BASE,
      tagline: 'Working together, close to home.',
      social: [{ label: 'Facebook', href: 'https://facebook.com/riverside' }],
      footerNote: 'Registered charity 1029384.',
      headerAction: { label: 'Donate', href: '/donate' },
    })
    expect(header).toContain('cg-site-header__action')
    expect(footer).toContain('cg-site-footer__tagline')
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('cg-site-footer__note')
  })
})
