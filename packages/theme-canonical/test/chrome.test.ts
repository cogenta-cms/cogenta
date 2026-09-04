import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

/**
 * `theme@1.4` (L25 D2) — `tagline`/`social`/`footerNote`/`headerAction`, all
 * optional and additive. The critical property this file exists to prove:
 * a render with none of them set is byte-identical to a `1.3` render, so an
 * existing site that never touches these settings is unaffected by this
 * theme accepting them.
 */

const BASE: ChromeInput = {
  site: { name: 'Reference Site' },
  locale: 'en',
  homeHref: '/',
  headerNav: [{ label: 'Blog', href: '/blog', openInNewTab: false, kind: 'url', title: null }],
  footerNav: [
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'url', title: null },
  ],
  brandingHtml: '<div class="cg-site-footer__branding">credit</div>',
}

describe('renderChrome — theme@1.4 fields', () => {
  it('renders byte-identical header and footer when none of the four new fields is set', () => {
    const preLot = renderChrome(BASE)

    const expectedHeader =
      `<header class="cg-site-header"><div class="cg-site-header__inner">` +
      `<a class="cg-site-header__home" href="/">Reference Site</a>` +
      `<nav class="cg-site-header__nav" aria-label="Primary"><ul class="cg-menu">` +
      `<li><a href="/blog">Blog</a></li></ul></nav>` +
      `</div></header>`
    const expectedFooter =
      `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
      `<span>Reference Site</span>` +
      `<nav class="cg-site-footer__nav" aria-label="Footer"><ul class="cg-menu">` +
      `<li><a href="/privacy">Privacy</a></li></ul></nav>` +
      `<div class="cg-site-footer__branding">credit</div></div></footer>`

    expect(preLot.header).toBe(expectedHeader)
    expect(preLot.footer).toBe(expectedFooter)
  })

  it('shows the tagline right after the site name in the footer, once set', () => {
    const { footer } = renderChrome({ ...BASE, tagline: 'A studio in Paris.' })
    expect(footer).toContain(
      '<span>Reference Site</span><p class="cg-site-footer__tagline">A studio in Paris.</p>',
    )
  })

  it('escapes a hostile tagline', () => {
    const { footer } = renderChrome({ ...BASE, tagline: '<script>alert(1)</script>' })
    expect(footer).not.toContain('<script>alert')
    expect(footer).toContain('&lt;script&gt;')
  })

  it('renders the social links as an icon list in the footer', () => {
    const { footer } = renderChrome({
      ...BASE,
      social: [
        { label: 'X', href: 'https://x.com/cogenta' },
        { label: 'GitHub', href: 'https://github.com/cogenta' },
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

  it('renders the footer note as its own "about" column, escaped', () => {
    const { footer } = renderChrome({ ...BASE, footerNote: 'A <b>very</b> real studio.' })
    expect(footer).toContain('cg-site-footer__about')
    expect(footer).not.toContain('<b>very</b>')
    expect(footer).toContain('&lt;b&gt;very&lt;/b&gt;')
  })

  it('renders the header action as a primary-styled link at the end of the header nav', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Book a demo', href: '/demo' },
    })
    expect(header).toContain('data-emphasis="primary"')
    expect(header).toContain('href="/demo"')
    expect(header).toContain('Book a demo')
    // After the primary nav, not before it — the nav still reads first.
    expect(header.indexOf('cg-site-header__nav')).toBeLessThan(
      header.indexOf('cg-site-header__action'),
    )
  })

  it('escapes a hostile header action label and href', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: '<script>x</script>', href: '"onmouseover=x' },
    })
    expect(header).not.toContain('<script>x')
    expect(header).not.toContain('"onmouseover=x')
  })

  it('renders all four fields together without interfering with one another', () => {
    const { header, footer } = renderChrome({
      ...BASE,
      tagline: 'A studio in Paris.',
      social: [{ label: 'X', href: 'https://x.com/cogenta' }],
      footerNote: 'Founded in 2020.',
      headerAction: { label: 'Get started', href: '/start' },
    })
    expect(header).toContain('cg-site-header__action')
    expect(footer).toContain('cg-site-footer__tagline')
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('cg-site-footer__about')
  })
})
