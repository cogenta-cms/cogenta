import type { ChromeInput, ChromeNavLink } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { footerGroups, renderChrome } from '../src/render/chrome.js'
import { splitSiteName } from '../src/render/strings.js'

const link = (label: string, href: string | null, kind = 'url'): ChromeNavLink => ({
  label,
  href,
  openInNewTab: false,
  kind,
  title: null,
})

const MINIMAL: ChromeInput = {
  site: { name: 'Relay Docs' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [],
  brandingHtml: '<a href="https://example.org">credit</a>',
}

const BASE: ChromeInput = {
  ...MINIMAL,
  headerNav: [
    link('Guides', '/docs/verifying-signatures'),
    link('Reference', '/docs/cli-reference'),
  ],
  footerNav: [
    link('Get started', null, 'submenu-placeholder'),
    link('Quickstart', '/docs/quickstart'),
    link('Help', null, 'submenu-placeholder'),
    link('Troubleshooting', '/docs/troubleshooting'),
  ],
}

describe('the header', () => {
  const { header } = renderChrome(BASE)

  it('sets the product in ink and the kind of site in grey', () => {
    expect(header).toContain(
      '<a class="cd-header__brand" href="/"><span class="cd-wordmark"><span class="cd-wordmark__product">Relay</span> <span class="cd-wordmark__kind">Docs</span></span></a>',
    )
  })

  it('keeps any other site name whole', () => {
    expect(renderChrome({ ...MINIMAL, site: { name: 'Tallyhall' } }).header).toContain(
      '<span class="cd-wordmark"><span class="cd-wordmark__product">Tallyhall</span></span>',
    )
    expect(splitSiteName('Northwind Developer Docs')).toEqual({
      product: 'Northwind',
      suffix: 'Developer Docs',
    })
  })

  it('carries a real search form that asks /search, with a labelled input', () => {
    expect(header).toContain('<form class="cd-search" action="/search" method="get" role="search">')
    expect(header).toContain(
      '<label class="cg-visually-hidden" for="cd-search-header">Search the documentation</label>',
    )
    expect(header).toContain('id="cd-search-header"')
  })

  it('lists the top sections in a labelled nav', () => {
    expect(header).toContain('<nav class="cd-header__nav" aria-label="Primary">')
    expect(header).toContain('<a href="/docs/cli-reference">Reference</a>')
  })

  it('places the shared light/dark control', () => {
    expect(header).toContain(serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' })))
  })

  it('opens a menu on a phone with a disclosure, never a script', () => {
    expect(header).toContain(
      '<details class="cd-menu"><summary class="cd-menu__button" aria-label="Menu">',
    )
    expect(header).toContain('id="cd-search-menu"')
    expect(header.match(/href="\/docs\/cli-reference"/g)).toHaveLength(2)
    expect(header).not.toMatch(/<script|\son[a-z]+="/i)
  })

  it('keeps a search link in the bar for a phone, named for assistive technology', () => {
    expect(header).toContain(
      '<a class="cd-header__search-link" href="/search" aria-label="Search">',
    )
  })

  it('renders the header action as an outlined control, in the bar and in the menu', () => {
    const withAction = renderChrome({
      ...BASE,
      headerAction: { label: 'GitHub', href: 'https://github.com/example' },
    }).header
    expect(withAction.match(/data-emphasis="outline"/g)).toHaveLength(2)
    expect(withAction.indexOf('cd-header__nav')).toBeLessThan(
      withAction.indexOf('cd-header__action'),
    )
  })

  it('draws no navigation at all when the site has none', () => {
    const { header: bare } = renderChrome(MINIMAL)
    expect(bare).not.toContain('cd-header__nav')
    expect(bare).not.toContain('cd-menu__nav')
  })

  it('escapes a hostile header action', () => {
    const { header: hostile } = renderChrome({
      ...MINIMAL,
      headerAction: { label: '<script>x</script>', href: '"onmouseover=x' },
    })
    expect(hostile).not.toContain('<script>x')
    expect(hostile).not.toContain('"onmouseover=x')
  })
})

describe('the footer', () => {
  const full = renderChrome({
    ...BASE,
    tagline: 'Signed webhook delivery.',
    footerNote: 'Released under the Apache License 2.0.\nDocumentation text under CC BY 4.0.',
    social: [
      { label: 'GitHub', href: 'https://github.com/example' },
      { label: 'X', href: 'https://x.com/example' },
    ],
  }).footer

  it('names the site, its tagline and its licence', () => {
    expect(full).toContain('<a class="cd-footer__name" href="/">Relay Docs</a>')
    expect(full).toContain(
      '<p class="cd-footer__tagline" data-field="tagline">Signed webhook delivery.</p>',
    )
    expect(full).toContain(
      '<p>Released under the Apache License 2.0.<br>Documentation text under CC BY 4.0.</p>',
    )
  })

  it('splits the footer menu into headed columns', () => {
    expect(full).toContain('data-columns="2"')
    expect(full).toContain('<p class="cd-footer__heading">Get started</p>')
    expect(footerGroups(BASE.footerNav).map((group) => group.heading)).toEqual([
      'Get started',
      'Help',
    ])
  })

  it('draws the social profiles as real icons with hidden text labels', () => {
    expect(full.match(/<svg/g)).toHaveLength(2)
    expect(full).toContain('<span class="cg-visually-hidden">GitHub</span>')
  })

  it('prints the copyright year and the product, and the host credit once, as received', () => {
    expect(full).toContain(
      `<p class="cd-footer__copyright">© ${new Date().getFullYear()} Relay</p>`,
    )
    expect(full.match(/credit<\/a>/g)).toHaveLength(1)
  })

  it('prints no caps line and no stray repetition of the name', () => {
    expect(full.match(/Relay Docs/g)).toHaveLength(1)
  })

  it('omits every optional part when nothing is set', () => {
    const { footer } = renderChrome({ ...MINIMAL, brandingHtml: '' })
    expect(footer).not.toMatch(/cd-footer__(tagline|note|social|nav|branding)/)
  })

  it('escapes a hostile tagline and note', () => {
    const { footer } = renderChrome({
      ...MINIMAL,
      tagline: '<script>alert(1)</script>',
      footerNote: 'A <b>real</b> note',
    })
    expect(footer).not.toContain('<script>alert')
    expect(footer).toContain('&lt;b&gt;real&lt;/b&gt;')
  })
})
