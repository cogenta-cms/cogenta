import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Atelier Goods' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [
    { label: 'Shop', href: '/en/shop', openInNewTab: false, kind: 'link', title: null },
    { label: 'Wear', href: '/en/category/wear', openInNewTab: false, kind: 'link', title: null },
  ],
  footerNav: [
    {
      label: 'Delivery and returns',
      href: '/en/delivery',
      openInNewTab: false,
      kind: 'link',
      title: null,
    },
    { label: 'Repairs', href: '/en/repairs', openInNewTab: false, kind: 'link', title: null },
  ],
  brandingHtml: '<div class="cg-site-footer__branding">Cogenta credit</div>',
}

const FULL: ChromeInput = {
  ...BASE,
  tagline: 'Everyday goods, made to last and to be mended.',
  social: [{ label: 'Instagram', href: 'https://instagram.com/example' }],
  footerNote: 'Rua da Boavista 84, 1200-066 Lisboa.\n\nRegistered in Portugal, NIPC 516 204 873.',
  headerAction: { label: 'How to order', href: '/en/how-to-order' },
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 240, height: 56, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'Atelier Goods',
  logo: source('/_image?id=light&w=480'),
  logoDark: null,
  faviconUrl: null,
}

describe('the header', () => {
  it('renders to stable markup', () => {
    const { header } = renderChrome(FULL)
    expect(header.replace(/© \d{4}/, '© YEAR')).toMatchSnapshot()
  })

  it('sets the shop’s name as its wordmark, linking home', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<a class="ce-header__brand" href="/en"><span class="ce-header__wordmark">Atelier Goods</span></a>',
    )
  })

  it('shows the uploaded logo instead of the name, still named and linked home', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="ce-header__logo"')
    expect(header).toContain('alt="Atelier Goods"')
    expect(header).not.toContain('ce-header__wordmark')
  })

  it('renders every real navigation link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<li class="ce-header__item"><a href="/en/shop">Shop</a></li>')
    expect(header).toContain('href="/en/category/wear">Wear</a>')
  })

  it('renders the header action as the last link of the navigation, never a filled button', () => {
    const { header } = renderChrome(FULL)
    expect(header).toContain(
      '<a class="ce-header__action" href="/en/how-to-order">How to order</a>',
    )
    expect(header).not.toMatch(/ce-header__action[^>]*data-emphasis/)
    expect(header.indexOf('ce-header__links')).toBeLessThan(header.indexOf('ce-header__action'))
  })

  it('draws no cart, no search box and no account link', () => {
    const { header } = renderChrome(FULL)
    expect(header).not.toMatch(/cart|basket|search|account|sign in/i)
  })

  it('ships a CSS-only menu toggle ahead of the one nav it controls', () => {
    const { header } = renderChrome(BASE)
    expect(header.indexOf('id="ce-nav-toggle"')).toBeLessThan(header.indexOf('id="ce-nav"'))
    expect(header).toMatch(/<input type="checkbox" id="ce-nav-toggle"[^>]*aria-label="Menu"/)
    expect(header).toContain(
      '<label for="ce-nav-toggle" class="ce-nav-toggle-label" aria-hidden="true">',
    )
    expect(header.match(/<nav/g)).toHaveLength(1)
  })

  it('renders neither toggle nor nav when there is no link and no action', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('ce-nav-toggle')
    expect(header).not.toContain('ce-header__nav')
    expect(header).toContain('data-nav="none"')
  })

  it('keeps the toggle and the nav when only the header action is set', () => {
    const { header } = renderChrome({ ...FULL, headerNav: [] })
    expect(header).toContain('ce-nav-toggle')
    expect(header).toContain('ce-header__action')
    expect(header).not.toContain('ce-header__links')
  })

  it('renders a submenu placeholder as an unlinked span, and drops a link with no target', () => {
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
        { label: 'Ghost', href: null, openInNewTab: false, kind: 'link', title: null },
      ],
    })
    expect(header).toContain('<span>Collections</span>')
    expect(header).not.toContain('Ghost')
  })

  it('carries a title attribute and a new-tab link through, with noopener', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Journal',
          href: 'https://journal.example',
          openInNewTab: true,
          kind: 'url',
          title: 'Letters',
        },
      ],
    })
    expect(header).toContain('target="_blank" rel="noopener" title="Letters"')
  })

  it('escapes a site name containing markup', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: '<b>Evil</b> Co' } })
    expect(header).toContain('&lt;b&gt;Evil&lt;/b&gt; Co')
    expect(footer).toContain('&lt;b&gt;Evil&lt;/b&gt; Co')
    expect(header + footer).not.toContain('<b>Evil</b>')
  })

  it('renders the theme toggle after the navigation, on every render', () => {
    const { header } = renderChrome(BASE)
    const toggle = serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' }))
    expect(header).toContain(toggle)
    expect(header.indexOf('id="ce-nav"')).toBeLessThan(header.indexOf('cg-theme-toggle'))
    expect(renderChrome({ ...BASE, headerNav: [] }).header).toContain('cg-theme-toggle')
  })

  it('localises the theme toggle from the chrome locale', () => {
    const { header } = renderChrome({ ...BASE, locale: 'fr' })
    expect(header).toContain(serialize(renderThemeToggle('fr', { className: 'cg-theme-toggle' })))
  })

  it('emits no script tag and no inline handler', () => {
    const { header, footer } = renderChrome(FULL)
    expect(header + footer).not.toMatch(/<script|\son[a-z]+="/i)
  })
})

describe('the footer', () => {
  it('renders to stable markup', () => {
    const { footer } = renderChrome(FULL)
    expect(footer.replace(/© \d{4}/, '© YEAR')).toMatchSnapshot()
  })

  it('keeps the shop’s name in text, even when it has a logo', () => {
    const { footer } = renderChrome({ ...BASE, brand: BRAND })
    expect(footer).toContain('<a class="ce-footer__name" href="/en">Atelier Goods</a>')
    expect(footer).not.toContain('ce-header__logo')
  })

  it('writes the copyright year and the shop’s name on the legal line', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain(
      `<p class="ce-footer__copyright">© ${new Date().getFullYear()} Atelier Goods</p>`,
    )
  })

  it('places the branding fragment once, byte for byte', () => {
    const { footer } = renderChrome(BASE)
    expect(footer.split('<div class="cg-site-footer__branding">Cogenta credit</div>')).toHaveLength(
      2,
    )
  })

  it('renders no branding wrapper when the fragment is empty', () => {
    const { footer } = renderChrome({ ...BASE, brandingHtml: '' })
    expect(footer).not.toContain('ce-footer__branding')
  })

  it('renders every footer link in a labelled navigation', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<nav class="ce-footer__nav" aria-label="Footer">')
    expect(footer).toContain('href="/en/repairs">Repairs</a>')
  })

  it('omits the footer navigation when there is none', () => {
    expect(renderChrome({ ...BASE, footerNav: [] }).footer).not.toContain('ce-footer__nav')
  })

  it('sets the tagline under the name when set, and nothing when absent', () => {
    expect(renderChrome(FULL).footer).toContain(
      '<p class="ce-footer__tagline" data-field="tagline">Everyday goods, made to last and to be mended.</p>',
    )
    expect(renderChrome(BASE).footer).not.toContain('ce-footer__tagline')
  })

  it('splits the footer note into paragraphs at blank lines', () => {
    expect(renderChrome(FULL).footer).toContain(
      '<div class="ce-footer__note"><p>Rua da Boavista 84, 1200-066 Lisboa.</p><p>Registered in Portugal, NIPC 516 204 873.</p></div>',
    )
    expect(renderChrome(BASE).footer).not.toContain('ce-footer__note')
  })

  it('renders social profiles with their icons and names, and no column when there are none', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('<div class="ce-footer__follow"><ul class="ce-footer__social">')
    expect(footer).toContain('https://instagram.com/example')
    expect(renderChrome(BASE).footer).not.toContain('ce-footer__follow')
  })
})
