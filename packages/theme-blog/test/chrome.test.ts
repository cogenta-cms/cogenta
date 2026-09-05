import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Field Notes' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Home', href: '/', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Writing', href: '/blog', openInNewTab: false, kind: 'internal', title: null },
    { label: 'About', href: '/about', openInNewTab: false, kind: 'internal', title: null },
  ],
  footerNav: [
    { label: 'About', href: '/about', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Archive', href: '/archive', openInNewTab: false, kind: 'internal', title: null },
    { label: 'RSS', href: '/feed.xml', openInNewTab: false, kind: 'internal', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

describe('renderChrome', () => {
  it('renders the real site name as the home link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cg-site-header__home" href="/"')
    expect(header).toContain('Field Notes')
  })

  it('wraps the nav in a single zero-JS <details> disclosure', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<details class="cg-menu">')
    expect(header).toContain('class="cg-menu__toggle"')
    expect(header).toContain('class="cg-menu__panel"')
  })

  it('renders every header link inside the disclosure', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/blog"')
    expect(header).toContain('>Writing<')
    expect(header).toContain('href="/about"')
  })

  it('renders no <details> at all when there is nothing to show', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('<details')
  })

  it('also renders an always-native desktop nav, shown by CSS in place of the disclosure from 56rem', () => {
    // A closed `<details>` cannot be forced to lay out its non-summary
    // content by an author `display` override in current Chrome (verified
    // against a real browser) — `.cg-site-nav` is a second, plain `<nav>`
    // carrying the same links, toggled purely by the `min-width: 56rem`
    // media query in `base.css`, never by opening the mobile disclosure.
    const { header } = renderChrome(BASE)
    expect(header).toContain('class="cg-site-nav"')
    expect(header).toMatch(/<nav class="cg-site-nav"[^>]*>[\s\S]*href="\/blog"[\s\S]*<\/nav>/)
  })

  it('renders no desktop nav either when there is nothing to show', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('cg-site-nav')
  })

  it('renders the disclosure for a header action alone, with no nav links', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [],
      headerAction: { label: 'Subscribe', href: '/#newsletter' },
    })
    expect(header).toContain('<details class="cg-menu">')
    expect(header).toMatch(/<a class="cg-action cg-menu__action"[^>]*>Subscribe<\/a>/)
  })

  it('renders the header action as a primary button inside the panel', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Subscribe', href: '/#newsletter' },
    })
    expect(header).toContain('data-emphasis="primary"')
    expect(header).toMatch(/href="\/#newsletter"[^>]*>Subscribe</)
  })

  it('renders every footer link', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('href="/about"')
    expect(footer).toContain('href="/archive"')
    expect(footer).toContain('href="/feed.xml"')
  })

  it('places the branding fragment inside the footer, unmodified', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<a href="https://cogenta.dev">Made with Cogenta</a>')
  })

  it('renders the footer as three real columns: brand, nav, meta', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('class="cg-site-footer__grid"')
    expect(footer).toContain('class="cg-site-footer__brand"')
    expect(footer).toContain('class="cg-site-footer__nav"')
    expect(footer).toContain('class="cg-site-footer__meta"')
  })

  it('renders the tagline only when the site set one (theme@1.4, additive)', () => {
    const without = renderChrome(BASE)
    expect(without.footer).not.toContain('cg-site-footer__tagline')
    const withTagline = renderChrome({ ...BASE, tagline: 'Writing about writing.' })
    expect(withTagline.footer).toContain('cg-site-footer__tagline')
    expect(withTagline.footer).toContain('Writing about writing.')
  })

  it('renders social links via the shared renderSocialLinks helper', () => {
    const { footer } = renderChrome({
      ...BASE,
      social: [{ label: 'Mastodon', href: 'https://mastodon.social/@example' }],
    })
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('cg-visually-hidden')
    expect(footer).toContain('Mastodon')
  })

  it('renders the footer note only when set', () => {
    const { footer } = renderChrome({ ...BASE, footerNote: 'A demo blog.' })
    expect(footer).toContain('cg-site-footer__note')
    expect(footer).toContain('A demo blog.')
  })

  it('renders byte-for-byte the pre-1.4 shape when none of the new fields are set', () => {
    const { footer } = renderChrome(BASE)
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
