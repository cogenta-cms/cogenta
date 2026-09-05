import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/**
 * `theme@1.4` (L25 D2) — `tagline`/`social`/`footerNote`/`headerAction`, all
 * optional and additive. This theme's own header also carries a CSS-only
 * mobile menu (a `<details>` disclosure, a second copy of the nav links
 * hidden by default and shown only at a narrow viewport — see `chrome.ts`'s
 * own comment for why two static copies, not a repositioned one).
 */

const MINIMAL: ChromeInput = {
  site: { name: 'Reference Site' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [],
  brandingHtml: '<div class="cg-site-footer__branding">credit</div>',
}

const BASE: ChromeInput = {
  ...MINIMAL,
  headerNav: [{ label: 'Blog', href: '/blog', openInNewTab: false, kind: 'url', title: null }],
  footerNav: [
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'url', title: null },
  ],
}

describe('renderChrome — no navigation, no 1.4 fields', () => {
  it('renders byte-identical header and footer with nothing to show', () => {
    const { header, footer } = renderChrome(MINIMAL)
    expect(header).toBe(
      '<header class="cg-site-header"><div class="cg-site-header__inner">' +
        '<a class="cg-site-header__home" href="/">Reference Site</a>' +
        '</div></header>',
    )
    expect(footer).toBe(
      '<footer class="cg-site-footer"><div class="cg-site-footer__grid">' +
        '<div class="cg-site-footer__brand"><a href="/">Reference Site</a></div>' +
        '<div class="cg-site-footer__nav-col"></div>' +
        '<div class="cg-site-footer__about-col">' +
        '<div class="cg-site-footer__branding"><div class="cg-site-footer__branding">credit</div></div>' +
        '</div></div>' +
        '<div class="cg-site-footer__bottom"><span>Reference Site</span></div></footer>',
    )
  })

  it('emits no mobile-menu markup at all when there is no navigation to show', () => {
    const { header } = renderChrome(MINIMAL)
    expect(header).not.toContain('cg-nav-toggle')
  })
})

describe('renderChrome — desktop nav and the mobile menu', () => {
  it('renders the desktop nav as its own <nav aria-label="Primary">', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<nav class="cg-site-header__nav" aria-label="Primary">')
    expect(header).toContain('<a href="/blog">Blog</a>')
  })

  it('duplicates the same links inside a <details> mobile disclosure, never a script', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<details class="cg-nav-toggle">')
    expect(header).toContain('<summary class="cg-nav-toggle__button"')
    expect(header).toContain('cg-nav-toggle__panel')
    expect(header).not.toMatch(/<script/i)
    // Both copies carry the real link — one is hidden by CSS, not by
    // being empty.
    expect(header.match(/href="\/blog"/g)?.length).toBe(2)
  })

  it('renders the footer nav as its own labelled <nav>', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<nav class="cg-site-footer__nav" aria-label="Footer">')
    expect(footer).toContain('<a href="/privacy">Privacy</a>')
  })
})

describe('renderChrome — theme@1.4 fields', () => {
  it('shows the tagline in the footer brand column, once set', () => {
    const { footer } = renderChrome({ ...MINIMAL, tagline: 'A docs site that stays current.' })
    expect(footer).toContain(
      '<a href="/">Reference Site</a><p class="cg-site-footer__tagline">A docs site that stays current.</p>',
    )
  })

  it('escapes a hostile tagline', () => {
    const { footer } = renderChrome({ ...MINIMAL, tagline: '<script>alert(1)</script>' })
    expect(footer).not.toContain('<script>alert')
    expect(footer).toContain('&lt;script&gt;')
  })

  it('renders the social links as an icon list in the footer', () => {
    const { footer } = renderChrome({
      ...MINIMAL,
      social: [
        { label: 'GitHub', href: 'https://github.com/cogenta' },
        { label: 'X', href: 'https://x.com/cogenta' },
      ],
    })
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('cg-visually-hidden')
    expect(footer.match(/<svg/g)?.length).toBe(2)
  })

  it('omits the social markup entirely when social is absent', () => {
    const { footer } = renderChrome(MINIMAL)
    expect(footer).not.toContain('cg-site-footer__social')
  })

  it('renders the footer note as its own "about" paragraph, escaped', () => {
    const { footer } = renderChrome({ ...MINIMAL, footerNote: 'A <b>real</b> docs site.' })
    expect(footer).toContain('cg-site-footer__note')
    expect(footer).not.toContain('<b>real</b>')
    expect(footer).toContain('&lt;b&gt;real&lt;/b&gt;')
  })

  it('renders the header action as a primary-styled button, in the desktop nav and again in the mobile panel', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Book a demo', href: '/demo' },
    })
    expect(header).toContain('data-emphasis="primary"')
    expect(header.match(/href="\/demo"/g)?.length).toBe(2)
    expect(header.match(/Book a demo/g)?.length).toBe(2)
    // After the primary nav, not before it — the nav still reads first.
    expect(header.indexOf('cg-site-header__nav')).toBeLessThan(
      header.indexOf('cg-site-header__action'),
    )
  })

  it('escapes a hostile header action label and href', () => {
    const { header } = renderChrome({
      ...MINIMAL,
      headerAction: { label: '<script>x</script>', href: '"onmouseover=x' },
    })
    expect(header).not.toContain('<script>x')
    expect(header).not.toContain('"onmouseover=x')
  })

  it('renders all four fields together without interfering with one another', () => {
    const { header, footer } = renderChrome({
      ...BASE,
      tagline: 'A docs site that stays current.',
      social: [{ label: 'GitHub', href: 'https://github.com/cogenta' }],
      footerNote: 'Founded in 2020.',
      headerAction: { label: 'Get started', href: '/start' },
    })
    expect(header).toContain('cg-site-header__action')
    expect(header).toContain('cg-nav-toggle__action')
    expect(footer).toContain('cg-site-footer__tagline')
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('cg-site-footer__note')
  })
})
