import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Studio Cogenta' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [
    { label: 'Work', href: '/en/work', openInNewTab: false, kind: 'page', title: null },
    { label: 'About', href: '/en/about', openInNewTab: false, kind: 'page', title: null },
  ],
  footerNav: [
    { label: 'Contact', href: '/en/contact', openInNewTab: false, kind: 'page', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Powered by Cogenta</a>',
}

describe('renderChrome', () => {
  it('renders the site name in the header, linked to home', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('Studio Cogenta')
    expect(header).toContain('href="/en"')
  })

  it('renders every header nav link, real hrefs only', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('href="/en/work"')
    expect(header).toContain('>Work<')
    expect(header).toContain('href="/en/about"')
    expect(header).toContain('>About<')
  })

  it('renders every footer nav link', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('href="/en/contact"')
    expect(footer).toContain('>Contact<')
  })

  it('places the branding fragment in the footer, unaltered', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<a href="https://cogenta.dev">Powered by Cogenta</a>')
  })

  it('never drops the branding fragment even when it is empty', () => {
    const { footer } = renderChrome({ ...BASE, brandingHtml: '' })
    expect(footer).toContain('cg-site-footer__branding')
  })

  it('repeats the site name as the footer statement', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('cg-site-footer__statement')
    const statementMatch = /cg-site-footer__statement" href="\/en">([^<]*)</.exec(footer)
    expect(statementMatch?.[1]).toBe('Studio Cogenta')
  })

  it('renders no nav element when a nav list is empty', () => {
    const { header, footer } = renderChrome({ ...BASE, headerNav: [], footerNav: [] })
    expect(header).not.toContain('cg-site-header__nav')
    expect(footer).not.toContain('<nav')
  })

  it('opens an external link in a new tab with rel="noopener"', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Blog',
          href: 'https://blog.example',
          openInNewTab: true,
          kind: 'external',
          title: null,
        },
      ],
    })
    expect(header).toContain('target="_blank"')
    expect(header).toContain('rel="noopener"')
  })

  it('renders an unlinked submenu placeholder as a span, not a dead link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Services',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
      ],
    })
    expect(header).toContain('<span>Services</span>')
    expect(header).not.toContain('href="null"')
  })

  it('escapes a site name that contains markup-like characters', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: 'A & <B>' } })
    expect(header).toContain('A &amp; &lt;B&gt;')
    expect(footer).toContain('A &amp; &lt;B&gt;')
    expect(header).not.toContain('<B>')
  })

  it('writes a running index number beside each nav link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('cg-nav__index')
    expect(header).toContain('>01<')
    expect(header).toContain('>02<')
  })

  it('carries a title attribute through to the rendered link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Work',
          href: '/en/work',
          openInNewTab: false,
          kind: 'page',
          title: 'Selected projects',
        },
      ],
    })
    expect(header).toContain('title="Selected projects"')
  })
})
