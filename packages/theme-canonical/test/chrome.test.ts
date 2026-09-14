import type { ChromeInput, ChromeNavLink } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { footerGroups, renderChrome } from '../src/render/chrome.js'

/**
 * `theme@1.4` (L25 D2) — `tagline`/`social`/`footerNote`/`headerAction`, all
 * optional and additive. The property this file exists to prove: a render
 * with none of them set carries no markup for any of them — no empty
 * wrapper, no stray label — so a site that never touches these settings gets
 * exactly the chrome below.
 *
 * The markup itself changed in L27 (the studio redesign: a CSS-only menu, a
 * footer in columns with a legal line), so the byte-for-byte expectation was
 * rewritten deliberately; the guarantee it states did not change. The light/
 * dark control and the year come from their real sources rather than from a
 * hand-copied literal that would drift the first time either changes.
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

function link(label: string, href: string | null, kind = 'url'): ChromeNavLink {
  return { label, href, openInNewTab: false, kind, title: null }
}

describe('renderChrome — theme@1.4 fields', () => {
  it('renders exactly this chrome, with no markup for any optional field, when none is set', () => {
    const chrome = renderChrome(BASE)
    const themeToggle = serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' }))
    const year = new Date().getFullYear()

    const expectedHeader =
      `<header class="cg-site-header" data-nav="links"><div class="cg-site-header__inner">` +
      `<a class="cg-site-header__home" href="/">Reference Site</a>` +
      `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle" aria-controls="cg-site-nav">` +
      `<label for="cg-nav-toggle" class="cg-nav-toggle__label">Menu</label>` +
      `<nav class="cg-site-header__nav" id="cg-site-nav" aria-label="Primary"><ul class="cg-menu">` +
      `<li><a href="/blog">Blog</a></li></ul></nav>` +
      `<div class="cg-site-header__end">${themeToggle}</div>` +
      `</div></header>`
    const expectedFooter =
      `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
      `<div class="cg-site-footer__identity"><p class="cg-site-footer__name">Reference Site</p></div>` +
      `<nav class="cg-site-footer__nav" aria-label="Footer" data-columns="1">` +
      `<div class="cg-site-footer__group"><ul class="cg-menu"><li><a href="/privacy">Privacy</a></li></ul></div></nav>` +
      `<div class="cg-site-footer__legal"><p class="cg-site-footer__copyright">© ${year} Reference Site</p>` +
      `<div class="cg-site-footer__branding">credit</div></div>` +
      `</div></footer>`

    expect(chrome.header).toBe(expectedHeader)
    expect(chrome.footer).toBe(expectedFooter)
    for (const absent of [
      'cg-site-footer__tagline',
      'cg-site-footer__social',
      'cg-site-footer__about',
      'cg-site-header__action',
      'cg-site-header__menu-action',
    ]) {
      expect(`${chrome.header}${chrome.footer}`).not.toContain(absent)
    }
  })

  it('shows the tagline right after the site name in the footer, once set', () => {
    const { footer } = renderChrome({ ...BASE, tagline: 'A studio in Paris.' })
    expect(footer).toContain(
      '<p class="cg-site-footer__name">Reference Site</p><p class="cg-site-footer__tagline">A studio in Paris.</p>',
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

  it('keeps the lines of a footer note, and splits it into paragraphs at blank lines', () => {
    const { footer } = renderChrome({
      ...BASE,
      footerNote: 'Reference Site Ltd\n14 Quay Street\n\nRegistered in England',
    })
    expect(footer).toContain(
      '<p class="cg-site-footer__note">Reference Site Ltd<br>14 Quay Street</p><p class="cg-site-footer__note">Registered in England</p>',
    )
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

  it('offers the header action a second time at the foot of the phone menu, for the stylesheet to show one of the two', () => {
    const { header } = renderChrome({
      ...BASE,
      headerAction: { label: 'Book a demo', href: '/demo' },
    })
    expect(header.match(/href="\/demo"/g)).toHaveLength(2)
    const nav = header.slice(header.indexOf('<nav'), header.indexOf('</nav>'))
    expect(nav).toContain('<p class="cg-site-header__menu-action">')
    expect(header.slice(header.indexOf('cg-site-header__end'))).toContain('cg-site-header__action')
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

describe('the header menu', () => {
  it('opens without a script: no script tag and no inline handler anywhere in the chrome', () => {
    const { header, footer } = renderChrome({
      ...BASE,
      tagline: 'x',
      footerNote: 'y',
      social: [{ label: 'X', href: 'https://x.com/a' }],
      headerAction: { label: 'Go', href: '/go' },
    })
    for (const part of [header, footer]) {
      expect(part).not.toMatch(/<script/i)
      expect(part).not.toMatch(/\son[a-z]+="/i)
      expect(part).not.toMatch(/javascript:/i)
    }
  })

  it('draws no menu control at all for a site with no primary pages', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).toContain('data-nav="none"')
    expect(header).not.toContain('cg-nav-toggle')
    expect(header).not.toContain('<nav')
  })

  it('names the menu control with a visible label tied to its checkbox, before the navigation it opens', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<label for="cg-nav-toggle" class="cg-nav-toggle__label">Menu</label>')
    expect(header.indexOf('id="cg-nav-toggle"')).toBeLessThan(header.indexOf('<nav'))
    // The label names the checkbox, so neither is hidden from assistive technology.
    expect(header).not.toMatch(/<(?:input|label)[^>]*aria-hidden/)
  })

  it('names the landmarks in the page’s own language', () => {
    const { header, footer } = renderChrome({ ...BASE, locale: 'fr-CA' })
    expect(header).toContain('aria-label="Principale"')
    expect(footer).toContain('aria-label="Pied de page"')
  })

  it('shows an unlinked heading as text rather than as a dead link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [link('Services', null, 'submenu-placeholder'), link('Blog', '/blog')],
    })
    expect(header).toContain('<li><span>Services</span></li>')
    expect(header).not.toContain('href="null"')
  })
})

describe('the footer', () => {
  it('ends on the legal line: the year and the site name, then the host’s credit exactly as received', () => {
    const { footer } = renderChrome({ ...BASE, brandingHtml: '<div class="x">made by</div>' })
    const legal = footer.slice(footer.indexOf('cg-site-footer__legal'))
    expect(legal).toContain(`© ${new Date().getFullYear()} Reference Site`)
    expect(legal).toContain('<div class="x">made by</div>')
    expect(footer.match(/made by/g)).toHaveLength(1)
  })

  it('splits the footer menu into columns at each unlinked heading', () => {
    const groups = footerGroups([
      link('Company', null, 'submenu-placeholder'),
      link('About', '/about'),
      link('Jobs', '/jobs'),
      link('Legal', null, 'submenu-placeholder'),
      link('Privacy', '/privacy'),
    ])
    expect(groups.map((group) => group.heading)).toEqual(['Company', 'Legal'])
    expect(groups.map((group) => group.links.map((item) => item.label))).toEqual([
      ['About', 'Jobs'],
      ['Privacy'],
    ])
  })

  it('drops a heading with no link under it, and keeps links before any heading in their own column', () => {
    const groups = footerGroups([
      link('Home', '/'),
      link('Empty', null, 'submenu-placeholder'),
      link('Legal', null, 'submenu-placeholder'),
      link('Privacy', '/privacy'),
    ])
    expect(groups.map((group) => group.heading)).toEqual([null, 'Legal'])
  })

  it('tells the stylesheet how many columns it has, never more than three', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((name) => [
      link(name, null, 'submenu-placeholder'),
      link(`${name} link`, `/${name}`),
    ])
    const { footer } = renderChrome({ ...BASE, footerNav: many })
    expect(footer).toContain('data-columns="3"')
    expect(footer.match(/cg-site-footer__heading/g)).toHaveLength(4)
  })

  it('draws no footer navigation when the footer menu is empty', () => {
    const { footer } = renderChrome({ ...BASE, footerNav: [] })
    expect(footer).not.toContain('cg-site-footer__nav')
    expect(footer).toContain('cg-site-footer__legal')
  })
})
