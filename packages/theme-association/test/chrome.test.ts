import type { ChromeInput, ChromeNavLink } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { footerGroups, renderChrome } from '../src/render/chrome.js'

/**
 * `theme@1.4` (`tagline`/`social`/`footerNote`/`headerAction`, all optional
 * and additive), this theme's CSS-only mobile menu, and the footer columns
 * a charity's site is organised in. The light/dark toggle is built from
 * `renderThemeToggle` itself rather than a copied literal.
 */

function link(label: string, href: string | null, kind = 'url'): ChromeNavLink {
  return { label, href, openInNewTab: false, kind, title: null }
}

const BASE: ChromeInput = {
  site: { name: 'Common Ground' },
  locale: 'en',
  homeHref: '/',
  headerNav: [link('What we do', '/what-we-do'), link('Events', '/events')],
  footerNav: [
    link('Get involved', null, 'submenu-placeholder'),
    link('Ways to give', '/donate'),
    link('Volunteer with us', '/volunteer'),
    link('About us', null, 'submenu-placeholder'),
    link('Where the money goes', '/finances'),
  ],
  brandingHtml: '<div class="cg-site-footer__branding">Cogenta credit</div>',
}

describe('the header', () => {
  it('sets the organisation’s name as its wordmark, linking home', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<a class="ca-header__brand" href="/"><span class="ca-header__wordmark">Common Ground</span></a>',
    )
  })

  it('renders every real navigation link once, in one nav', () => {
    const { header } = renderChrome(BASE)
    expect(header.match(/<nav /g)).toHaveLength(1)
    expect(header.match(/href="\/events"/g)).toHaveLength(1)
  })

  it('renders the header action as the standing donation ask, outside the menu panel', () => {
    const { header } = renderChrome({ ...BASE, headerAction: { label: 'Donate', href: '/donate' } })
    expect(header).toContain('<a class="ca-header__action" href="/donate">Donate</a>')
    expect(header.indexOf('ca-header__action')).toBeGreaterThan(header.indexOf('</nav>'))
    expect(header).toContain('data-action="link"')
  })

  it('opens the menu with a checkbox and a label that says Menu and Close, no script', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<input type="checkbox" id="ca-nav-toggle" class="ca-nav-toggle-input" aria-label="Menu">',
    )
    expect(header).toContain('<span class="ca-nav-toggle-open">Menu</span>')
    expect(header).toContain('<span class="ca-nav-toggle-close">Close</span>')
    expect(header.indexOf('ca-nav-toggle-input')).toBeLessThan(header.indexOf('<nav'))
  })

  it('names the menu button in the page’s language', () => {
    const { header } = renderChrome({ ...BASE, locale: 'fr' })
    expect(header).toContain('<span class="ca-nav-toggle-close">Fermer</span>')
    expect(header).toContain('aria-label="Navigation principale"')
  })

  it('keeps the donation ask and the light/dark control when there are no links', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [],
      headerAction: { label: 'Donate', href: '/donate' },
    })
    expect(header).not.toContain('ca-nav-toggle')
    expect(header).toContain('ca-header__action')
    expect(header).toContain('data-nav="none"')
    expect(header).toContain(serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' })))
  })

  it('repeats the tagline in the menu panel', () => {
    const { header } = renderChrome({ ...BASE, tagline: 'Food, homework help and warm coats.' })
    expect(header).toContain(
      '<p class="ca-header__tagline">Food, homework help and warm coats.</p>',
    )
  })

  it('renders a submenu placeholder as an unlinked span, and drops a link with no target', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [link('Get involved', null, 'submenu-placeholder'), link('Dead', null)],
    })
    expect(header).toContain('<li class="ca-header__item"><span>Get involved</span></li>')
    expect(header).not.toContain('Dead')
  })

  it('carries a title attribute and a new-tab link through, with noopener', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        { ...link('Map', 'https://maps.example'), openInNewTab: true, title: 'The hall on a map' },
      ],
    })
    expect(header).toContain('target="_blank" rel="noopener" title="The hall on a map"')
  })

  it('escapes a site name containing markup', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: '<b>Friends</b> & Co' } })
    expect(header).toContain('&lt;b&gt;Friends&lt;/b&gt; &amp; Co')
    expect(footer).not.toContain('<b>')
  })

  it('emits no script tag and no inline handler', () => {
    const { header, footer } = renderChrome({
      ...BASE,
      headerAction: { label: 'Donate', href: '/donate' },
    })
    expect(header + footer).not.toMatch(/<script|\son[a-z]+="/i)
  })
})

describe('the footer columns', () => {
  it('starts a column at each unlinked heading and fills it with the links that follow', () => {
    const groups = footerGroups(BASE.footerNav)
    expect(groups.map((group) => group.heading)).toEqual(['Get involved', 'About us'])
    expect(groups[0]?.links.map((l) => l.label)).toEqual(['Ways to give', 'Volunteer with us'])
  })

  it('drops a heading with nothing under it, and keeps links before the first heading', () => {
    const groups = footerGroups([
      link('Privacy', '/privacy'),
      link('Empty', null, 'submenu-placeholder'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.heading).toBeNull()
  })

  it('names the columns in a labelled navigation, caps the grid at three columns', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('<nav class="ca-footer__nav" aria-label="Footer" data-columns="2">')
    expect(footer).toContain('<p class="ca-footer__heading">Get involved</p>')
  })

  it('renders no footer navigation when there is none', () => {
    const { footer } = renderChrome({ ...BASE, footerNav: [] })
    expect(footer).not.toContain('ca-footer__nav')
  })
})

describe('the footer', () => {
  it('writes the copyright year and the organisation’s name on the legal line', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain(
      `<p class="ca-footer__copyright">© ${new Date().getFullYear()} Common Ground</p>`,
    )
  })

  it('places the branding fragment once, byte for byte', () => {
    const { footer } = renderChrome(BASE)
    expect(footer.split('<div class="cg-site-footer__branding">Cogenta credit</div>')).toHaveLength(
      2,
    )
    expect(renderChrome({ ...BASE, brandingHtml: '' }).footer).not.toContain('ca-footer__branding')
  })

  it('keeps the lines of the registration and address, and splits paragraphs at blank lines', () => {
    const { footer } = renderChrome({
      ...BASE,
      footerNote: 'Registered charity no. 1299418\nThe Old Library\n\n01632 960418',
    })
    expect(footer).toContain(
      '<div class="ca-footer__note"><p>Registered charity no. 1299418<br>The Old Library</p><p>01632 960418</p></div>',
    )
  })

  it('reads Windows line endings as line endings, and escapes markup in the note', () => {
    const { footer } = renderChrome({ ...BASE, footerNote: 'One\r\nTwo <i>' })
    expect(footer).toContain('<p>One<br>Two &lt;i&gt;</p>')
  })

  it('renders social profiles with their icons and names, and nothing when there are none', () => {
    const { footer } = renderChrome({
      ...BASE,
      social: [{ label: 'Instagram', href: 'https://instagram.com/x' }],
    })
    expect(footer).toContain('<ul class="ca-footer__social">')
    expect(footer).toContain('<span class="cg-visually-hidden">Instagram</span>')
    expect(renderChrome(BASE).footer).not.toContain('ca-footer__social')
  })

  it('renders none of the theme@1.4 fields when absent, as a pre-1.4 site did', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header + footer).not.toMatch(
      /ca-footer__tagline|ca-footer__note|ca-header__action|ca-header__tagline/,
    )
  })
})
