import type { ChromeInput } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Maison Verte' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [
    { label: 'Menu', href: '/en/menu', openInNewTab: false, kind: 'link', title: null },
    { label: 'Our story', href: '/en/our-story', openInNewTab: false, kind: 'link', title: null },
  ],
  footerNav: [
    {
      label: 'Reservations',
      href: '/en/reservations',
      openInNewTab: false,
      kind: 'link',
      title: null,
    },
    { label: 'Legal notice', href: '/en/legal', openInNewTab: false, kind: 'link', title: null },
  ],
  brandingHtml: '<div class="cg-site-footer__branding">Cogenta credit</div>',
}

const FULL: ChromeInput = {
  ...BASE,
  tagline: 'Seasonal cooking on the slopes of the Croix-Rousse.',
  social: [{ label: 'Instagram', href: 'https://instagram.com/example' }],
  footerNote: '8 rue Burdeau\n69001 Lyon\n+33 4 78 28 16 42\n\nDinner Tuesday to Saturday.',
  headerAction: { label: 'Reserve', href: '/en/reservations' },
}

describe('the header', () => {
  it('renders to stable markup', () => {
    expect(renderChrome(FULL).header).toMatchSnapshot()
  })

  it('sets the restaurant’s name as its wordmark, linking home', () => {
    expect(renderChrome(BASE).header).toContain(
      '<a class="cr-header__brand" href="/en"><span class="cr-header__wordmark">Maison Verte</span></a>',
    )
  })

  it('renders every real navigation link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<li class="cr-header__item"><a href="/en/menu">Menu</a></li>')
    expect(header).toContain('href="/en/our-story">Our story</a>')
  })

  it('renders the reservation action as one underlined link outside the navigation, never a filled button', () => {
    const { header } = renderChrome(FULL)
    expect(header).toContain('<a class="cr-header__action" href="/en/reservations">Reserve</a>')
    expect(header).not.toMatch(/cr-header__action[^>]*data-emphasis/)
    expect(header.indexOf('</nav>')).toBeLessThan(header.indexOf('cr-header__action'))
  })

  it('keeps the reservation action when the site has no navigation links at all', () => {
    const { header } = renderChrome({ ...FULL, headerNav: [] })
    expect(header).toContain('cr-header__action')
    expect(header).toContain('data-action="link"')
    expect(header).not.toContain('cr-nav-toggle')
  })

  it('draws no booking form, no date picker and no button standing in for one', () => {
    const { header } = renderChrome(FULL)
    expect(header).not.toMatch(/<form|<select|type="date"|book now/i)
    expect(header.match(/<button/g)).toHaveLength(1)
  })

  it('ships a CSS-only menu toggle ahead of the one nav it controls', () => {
    const { header } = renderChrome(BASE)
    expect(header.indexOf('id="cr-nav-toggle"')).toBeLessThan(header.indexOf('id="cr-nav"'))
    expect(header).toMatch(/<input type="checkbox" id="cr-nav-toggle"[^>]*aria-label="Navigation"/)
    expect(header).toContain(
      '<label for="cr-nav-toggle" class="cr-nav-toggle-label" aria-hidden="true">',
    )
    expect(header.match(/<nav/g)).toHaveLength(1)
  })

  it('carries the address card in the menu panel when the site has a footer note', () => {
    const { header } = renderChrome(FULL)
    expect(header).toContain(
      '<div class="cr-header__card"><p>8 rue Burdeau<br>69001 Lyon<br>+33 4 78 28 16 42</p><p>Dinner Tuesday to Saturday.</p></div>',
    )
    expect(header.indexOf('cr-header__card')).toBeLessThan(header.indexOf('</nav>'))
    expect(renderChrome(BASE).header).not.toContain('cr-header__card')
  })

  it('renders neither toggle nor nav when there is no link', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('cr-nav-toggle')
    expect(header).not.toContain('cr-header__nav')
    expect(header).toContain('data-nav="none"')
  })

  it('renders a submenu placeholder as an unlinked span, and drops a link with no target', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Wine',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
        { label: 'Ghost', href: null, openInNewTab: false, kind: 'link', title: null },
      ],
    })
    expect(header).toContain('<span>Wine</span>')
    expect(header).not.toContain('Ghost')
  })

  it('carries a title attribute and a new-tab link through, with noopener', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Gift vouchers',
          href: 'https://vouchers.example',
          openInNewTab: true,
          kind: 'url',
          title: 'Vouchers',
        },
      ],
    })
    expect(header).toContain('target="_blank" rel="noopener" title="Vouchers"')
  })

  it('escapes a site name containing markup', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: '<b>Chez</b> Nous' } })
    expect(header).toContain('&lt;b&gt;Chez&lt;/b&gt; Nous')
    expect(footer).toContain('&lt;b&gt;Chez&lt;/b&gt; Nous')
    expect(header + footer).not.toContain('<b>Chez</b>')
  })

  it('escapes a footer note containing markup, in the panel and in the footer', () => {
    const { header, footer } = renderChrome({ ...BASE, footerNote: '<script>x</script>' })
    expect(header + footer).not.toContain('<script>')
    expect(footer).toContain('&lt;script&gt;x&lt;/script&gt;')
  })

  it('renders the theme toggle on every render, localised from the chrome locale', () => {
    expect(renderChrome(BASE).header).toContain(
      serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' })),
    )
    expect(renderChrome({ ...BASE, headerNav: [] }).header).toContain('cg-theme-toggle')
    expect(renderChrome({ ...BASE, locale: 'fr' }).header).toContain(
      serialize(renderThemeToggle('fr', { className: 'cg-theme-toggle' })),
    )
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

  it('writes the copyright year and the restaurant’s name on the legal line', () => {
    expect(renderChrome(BASE).footer).toContain(
      `<p class="cr-footer__copyright">© ${new Date().getFullYear()} Maison Verte</p>`,
    )
  })

  it('places the branding fragment once, byte for byte', () => {
    expect(
      renderChrome(BASE).footer.split('<div class="cg-site-footer__branding">Cogenta credit</div>'),
    ).toHaveLength(2)
  })

  it('renders no branding wrapper when the fragment is empty', () => {
    expect(renderChrome({ ...BASE, brandingHtml: '' }).footer).not.toContain('cr-footer__branding')
  })

  it('renders every footer link in a labelled navigation, and none when there are none', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<nav class="cr-footer__nav" aria-label="Footer">')
    expect(footer).toContain('href="/en/legal">Legal notice</a>')
    expect(renderChrome({ ...BASE, footerNav: [] }).footer).not.toContain('cr-footer__nav')
  })

  it('sets the tagline under the name when set, and nothing when absent', () => {
    expect(renderChrome(FULL).footer).toContain(
      '<p class="cr-footer__tagline" data-field="tagline">Seasonal cooking on the slopes of the Croix-Rousse.</p>',
    )
    expect(renderChrome(BASE).footer).not.toContain('cr-footer__tagline')
  })

  it('keeps the lines of an address and splits paragraphs at blank lines', () => {
    expect(renderChrome(FULL).footer).toContain(
      '<div class="cr-footer__note"><p>8 rue Burdeau<br>69001 Lyon<br>+33 4 78 28 16 42</p><p>Dinner Tuesday to Saturday.</p></div>',
    )
    expect(renderChrome(BASE).footer).not.toContain('cr-footer__note')
  })

  it('reads Windows line endings as line endings', () => {
    expect(renderChrome({ ...BASE, footerNote: 'One\r\nTwo\r\n\r\nThree' }).footer).toContain(
      '<p>One<br>Two</p><p>Three</p>',
    )
  })

  it('renders social profiles with their icons and names, and no column when there are none', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('<div class="cr-footer__follow"><ul class="cr-footer__social">')
    expect(footer).toContain('https://instagram.com/example')
    expect(renderChrome(BASE).footer).not.toContain('cr-footer__follow')
  })

  it('renders none of the theme@1.4 fields when absent, as a pre-1.4 site did', () => {
    const { header, footer } = renderChrome(BASE)
    for (const piece of [
      'cr-header__action',
      'cr-footer__tagline',
      'cr-footer__note',
      'cr-footer__social',
    ]) {
      expect(header + footer).not.toContain(piece)
    }
  })
})
