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
})
