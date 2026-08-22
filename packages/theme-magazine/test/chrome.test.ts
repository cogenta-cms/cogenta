import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'The Composing Room' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [
    {
      label: 'Field notes',
      href: '/en/field-notes',
      openInNewTab: false,
      kind: 'page',
      title: null,
    },
    { label: 'Archive', href: '/en/archive', openInNewTab: false, kind: 'page', title: null },
  ],
  footerNav: [
    { label: 'About', href: '/en/about', openInNewTab: false, kind: 'page', title: null },
    {
      label: 'Masthead credits',
      href: 'https://example.org/credits',
      openInNewTab: true,
      kind: 'external',
      title: 'Opens in a new tab',
    },
  ],
  brandingHtml:
    '<div class="cg-site-footer__branding"><a href="https://cogenta.dev">Cogenta</a></div>',
}

describe('renderChrome', () => {
  it('renders the site name as the nameplate wordmark, linked home', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<a class="cg-masthead__wordmark" href="/en">The Composing Room</a>')
  })

  it('renders every header nav link, real hrefs, none invented', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/en/field-notes"')
    expect(header).toContain('href="/en/archive"')
    expect(header).not.toContain('href="/en/contact"')
  })

  it('opens an external link in a new tab with the right rel', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('href="https://example.org/credits"')
    expect(footer).toContain('target="_blank"')
    expect(footer).toContain('rel="noopener"')
  })

  it('carries a link title through as the HTML title attribute, not the label', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('title="Opens in a new tab"')
    expect(footer).toContain('>Masthead credits<')
  })

  it('never drops the branding fragment, and never rewrites it', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain(BASE.brandingHtml)
  })

  it('renders an unlinked submenu placeholder as text, not a dead anchor', () => {
    const withPlaceholder: ChromeInput = {
      ...BASE,
      headerNav: [
        ...BASE.headerNav,
        {
          label: 'More',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
      ],
    }
    const { header } = renderChrome(withPlaceholder)
    expect(header).toContain('<span>More</span>')
    expect(header).not.toContain('<a href="null"')
  })

  it('drops a dead link entirely rather than rendering an empty href', () => {
    const withDeadLink: ChromeInput = {
      ...BASE,
      headerNav: [{ label: 'Gone', href: null, openInNewTab: false, kind: 'page', title: null }],
    }
    const { header } = renderChrome(withDeadLink)
    expect(header).not.toContain('Gone')
  })

  it('renders no navigation markup at all when a slot is empty', () => {
    const { header, footer } = renderChrome({ ...BASE, headerNav: [], footerNav: [] })
    expect(header).not.toContain('cg-masthead__menu')
    expect(footer).not.toContain('cg-colophon__menu')
  })

  it('escapes a site name that contains markup', () => {
    const { header } = renderChrome({ ...BASE, site: { name: '<b>Evil</b> Gazette' } })
    expect(header).not.toContain('<b>Evil</b>')
    expect(header).toContain('&lt;b&gt;Evil&lt;/b&gt; Gazette')
  })

  it('emits no script tag and no inline handler', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header + footer).not.toMatch(/<script/i)
    expect(header + footer).not.toMatch(/\son[a-z]+="/i)
  })
})
