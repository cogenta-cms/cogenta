import type { ChromeBrand, ChromeInput, ImageSource } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Studio Hale' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Work', href: '/work', openInNewTab: false, kind: 'url', title: null },
    { label: 'Studio', href: '/studio', openInNewTab: false, kind: 'url', title: null },
  ],
  footerNav: [
    { label: 'Contact', href: '/contact', openInNewTab: false, kind: 'url', title: null },
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'url', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const FULL: ChromeInput = {
  ...BASE,
  tagline: 'Identity, print, wayfinding and exhibitions.',
  footerNote: 'Second floor, 41 Hatherley Mews, London.\n\nVisits by appointment.',
  social: [
    { label: 'Instagram', href: 'https://instagram.com/example' },
    { label: 'LinkedIn', href: 'https://linkedin.com/company/example' },
  ],
  headerAction: { label: 'Start a project', href: '/contact' },
}

function source(src: string): ImageSource {
  return { kind: 'image', src, srcset: '', width: 200, height: 48, alt: '', focal: null }
}

const BRAND: ChromeBrand = {
  name: 'Studio Hale',
  logo: source('/_image?id=light&w=400'),
  logoDark: source('/_image?id=dark&w=400'),
  faviconUrl: null,
}

describe('renderChrome, the header', () => {
  it('sets the studio name as a wordmark, linking home', () => {
    expect(renderChrome(BASE).header).toContain(
      '<a class="cg-masthead__home" href="/"><span class="cg-masthead__wordmark">Studio Hale</span></a>',
    )
  })

  it('replaces the wordmark with an uploaded logo named after the site, and a dark variant beside it', () => {
    const { header } = renderChrome({ ...BASE, brand: BRAND })
    expect(header).toContain('class="cg-masthead__logo"')
    expect(header).toContain('alt="Studio Hale"')
    expect(header).toContain('media="(prefers-color-scheme: dark)"')
    expect(header).not.toContain('cg-masthead__wordmark')
  })

  it('lists the navigation in one landmark, links as given', () => {
    const { header } = renderChrome(BASE)
    expect(header.match(/<nav /g)).toHaveLength(1)
    expect(header).toContain(
      '<nav class="cg-masthead__nav" id="cg-nav" aria-label="Primary"><ul class="cg-masthead__links"><li class="cg-masthead__item"><a href="/work">Work</a></li>',
    )
  })

  it('numbers nothing: a studio’s navigation is words, not an index', () => {
    const { header } = renderChrome(BASE)
    expect(header).not.toMatch(/>0\d</)
    expect(header).not.toContain('__index')
  })

  it('opens the navigation on a narrow screen with a CSS-only checkbox, placed before the navigation', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">',
    )
    expect(header).toContain(
      '<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">',
    )
    expect(header.indexOf('cg-nav-toggle-label')).toBeLessThan(header.indexOf('cg-masthead__nav'))
    expect(header).not.toMatch(/<script|\son[a-z]+="/i)
  })

  it('renders no toggle and no navigation when there are no links and no action', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('cg-nav-toggle')
    expect(header).not.toContain('<nav')
    expect(header).toContain('data-nav="none"')
  })

  it('keeps a toggle for a header that has only an action', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [],
      headerAction: { label: 'Start a project', href: '/contact' },
    })
    expect(header).toContain('cg-nav-toggle-input')
    expect(header).toContain('data-nav="links"')
  })

  it('sets the header action as the last link of the navigation, words and no button', () => {
    const { header } = renderChrome(FULL)
    expect(header).toContain(
      '</ul><a class="cg-masthead__action" href="/contact">Start a project</a></nav>',
    )
    expect(header).not.toContain('data-emphasis')
  })

  it('sets the tagline beside the name only when there is one', () => {
    expect(renderChrome(FULL).header).toContain(
      '<p class="cg-masthead__tagline">Identity, print, wayfinding and exhibitions.</p>',
    )
    expect(renderChrome(BASE).header).not.toContain('cg-masthead__tagline')
  })

  it('renders a placeholder item as text, honours a new tab, a title, and drops a dead link', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'More',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
        {
          label: 'Journal',
          href: 'https://journal.example',
          openInNewTab: true,
          kind: 'url',
          title: 'Our notes',
        },
        { label: 'Gone', href: null, openInNewTab: false, kind: 'entry', title: null },
      ],
    })
    expect(header).toContain('<li class="cg-masthead__item"><span>More</span></li>')
    expect(header).toContain(
      '<a href="https://journal.example" target="_blank" rel="noopener" title="Our notes">Journal</a>',
    )
    expect(header).not.toContain('Gone')
  })

  it('escapes every string it is given', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: 'A & <B>' } })
    expect(header).toContain('A &amp; &lt;B&gt;')
    expect(footer).toContain('A &amp; &lt;B&gt;')
    expect(header).not.toContain('<B>')
  })

  it('always renders the theme-kit light and dark toggle, after the navigation, in the page locale', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' })))
    expect(header.indexOf('cg-masthead__nav')).toBeLessThan(header.indexOf('cg-theme-toggle'))
    expect(renderChrome({ ...BASE, locale: 'fr' }).header).toContain(
      serialize(renderThemeToggle('fr', { className: 'cg-theme-toggle' })),
    )
    expect(renderChrome({ ...BASE, headerNav: [] }).header).toContain('data-cg-theme-toggle')
  })
})

describe('renderChrome, the footer', () => {
  it('repeats the name as a link home', () => {
    expect(renderChrome(BASE).footer).toContain(
      '<a class="cg-colophon__name" href="/">Studio Hale</a>',
    )
  })

  it('sets the tagline and each paragraph of the footer note', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain(
      'data-field="tagline">Identity, print, wayfinding and exhibitions.</p>',
    )
    expect(footer).toContain(
      '<div class="cg-colophon__note"><p>Second floor, 41 Hatherley Mews, London.</p><p>Visits by appointment.</p></div>',
    )
  })

  it('lists the footer navigation in its own landmark', () => {
    expect(renderChrome(BASE).footer).toContain(
      '<nav class="cg-colophon__nav" aria-label="Footer"><ul class="cg-colophon__links"><li class="cg-colophon__item"><a href="/contact">Contact</a></li>',
    )
  })

  it('lists the social profiles with real icons and their names', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('class="cg-colophon__social"')
    expect(footer.match(/<svg/g)).toHaveLength(2)
    expect(footer).toContain('<span class="cg-visually-hidden">Instagram</span>')
  })

  it('writes the legal line with the year and the name beside the branding, placed once and unaltered', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain(
      `<p class="cg-colophon__copyright">© ${new Date().getFullYear()} Studio Hale</p>`,
    )
    expect(footer.match(/Made with Cogenta/g)).toHaveLength(1)
    expect(footer).toContain('<a href="https://cogenta.dev">Made with Cogenta</a>')
  })

  it('keeps the branding slot when the branding is empty', () => {
    expect(renderChrome({ ...BASE, brandingHtml: '' }).footer).toContain(
      '<div class="cg-colophon__branding"></div>',
    )
  })

  it('writes no heading of its own: a heading is a word the theme cannot translate', () => {
    expect(renderChrome(FULL).footer).not.toMatch(/<h[1-6]/)
  })

  it('renders the name and the navigation for a host that predates theme@1.4', () => {
    const { header, footer } = renderChrome(BASE)
    expect(header).not.toContain('cg-masthead__action')
    expect(footer).not.toContain('cg-colophon__tagline')
    expect(footer).not.toContain('cg-colophon__note')
    expect(footer).not.toContain('cg-colophon__follow')
    expect(footer).toContain('cg-colophon__nav')
  })

  it('renders no footer navigation landmark when the footer menu is empty', () => {
    expect(renderChrome({ ...BASE, footerNav: [] }).footer).not.toContain('<nav')
  })

  it('still names the site in the footer when a logo replaces the wordmark in the header', () => {
    expect(renderChrome({ ...BASE, brand: BRAND }).footer).toContain('Studio Hale')
  })
})
