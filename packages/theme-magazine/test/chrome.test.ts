import type { ChromeInput } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'The Meridian' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'News', href: '/section/news', openInNewTab: false, kind: 'url', title: null },
    { label: 'Culture', href: '/section/culture', openInNewTab: false, kind: 'url', title: null },
  ],
  footerNav: [
    { label: 'About', href: '/about', openInNewTab: false, kind: 'url', title: null },
    { label: 'Standards', href: '/standards', openInNewTab: false, kind: 'url', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const FULL: ChromeInput = {
  ...BASE,
  tagline: 'Independent news and culture from Port Calder.',
  footerNote: 'Published by the Harbor Press Cooperative.\n\nLetters go to the standards desk.',
  social: [
    { label: 'Bluesky', href: 'https://bsky.app/profile/example.bsky.social' },
    { label: 'Instagram', href: 'https://instagram.com/example' },
  ],
  headerAction: { label: 'Subscribe', href: '/subscribe' },
}

describe('renderChrome, the masthead', () => {
  it('sets the nameplate in the display face, linking home', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<a class="cg-masthead__home" href="/"><span class="cg-masthead__name">The Meridian</span></a>',
    )
  })

  it("dates the bar with today's date in a time element, a long and a short form", () => {
    const { header } = renderChrome(BASE)
    const today = new Date().toISOString().slice(0, 10)
    expect(header).toContain(`<time datetime="${today}">`)
    expect(header).toContain('class="cg-masthead__date-long"')
    expect(header).toContain('class="cg-masthead__date-short" aria-hidden="true"')
  })

  it('sets the sections in one navigation landmark', () => {
    const { header } = renderChrome(BASE)
    expect(header.match(/<nav /g)).toHaveLength(1)
    expect(header).toContain(
      '<nav class="cg-masthead__nav" id="cg-nav" aria-label="Primary"><ul class="cg-masthead__sections"><li><a href="/section/news">News</a></li>',
    )
  })

  it('opens the sections on a narrow screen with a CSS-only checkbox, placed before the navigation', () => {
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

  it('renders no toggle and no navigation when there are no sections', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('cg-nav-toggle')
    expect(header).not.toContain('<nav')
    expect(header).toContain('data-nav="none"')
  })

  it('keeps the header action in the bar, so it stays visible with the menu closed', () => {
    const { header } = renderChrome(FULL)
    const tools = header.slice(
      header.indexOf('cg-masthead__tools'),
      header.indexOf('cg-masthead__plate'),
    )
    expect(tools).toContain(
      '<a class="cg-action cg-masthead__action" data-emphasis="masthead" href="/subscribe">Subscribe</a>',
    )
  })

  it('places the theme toggle in the bar, which renders on every page', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).toContain('data-cg-theme-toggle')
  })

  it('sets the tagline in the bar only when there is one', () => {
    expect(renderChrome(FULL).header).toContain(
      '<p class="cg-masthead__tagline">Independent news and culture from Port Calder.</p>',
    )
    expect(renderChrome(BASE).header).not.toContain('cg-masthead__tagline')
  })

  it('renders a placeholder item as text and honours a link that opens a new tab', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Sections',
          href: null,
          openInNewTab: false,
          kind: 'submenu-placeholder',
          title: null,
        },
        {
          label: 'Archive',
          href: 'https://archive.example',
          openInNewTab: true,
          kind: 'url',
          title: 'Old site',
        },
        { label: 'Gone', href: null, openInNewTab: false, kind: 'entry', title: null },
      ],
    })
    expect(header).toContain('<li><span>Sections</span></li>')
    expect(header).toContain(
      '<li><a href="https://archive.example" target="_blank" rel="noopener" title="Old site">Archive</a></li>',
    )
    expect(header).not.toContain('Gone')
  })

  it('escapes every string it is given', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: '<b>Meridian</b>' } })
    expect(header).toContain('&lt;b&gt;Meridian&lt;/b&gt;')
    expect(footer).not.toContain('<b>')
  })
})

describe('renderChrome, the colophon', () => {
  it('repeats the name as a link home', () => {
    expect(renderChrome(BASE).footer).toContain(
      '<a class="cg-colophon__name" href="/">The Meridian</a>',
    )
  })

  it('sets the tagline and each paragraph of the footer note', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain(
      'data-field="tagline">Independent news and culture from Port Calder.</p>',
    )
    expect(footer).toContain(
      '<div class="cg-colophon__note"><p>Published by the Harbor Press Cooperative.</p><p>Letters go to the standards desk.</p></div>',
    )
  })

  it('lists the footer navigation in its own landmark', () => {
    expect(renderChrome(BASE).footer).toContain(
      '<nav class="cg-colophon__nav" aria-label="Footer"><ul class="cg-colophon__links">',
    )
  })

  it('lists the social profiles with real icons and their names', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('class="cg-colophon__social"')
    expect(footer.match(/<svg/g)).toHaveLength(2)
    expect(footer).toContain('<span class="cg-visually-hidden">Bluesky</span>')
  })

  it('writes the legal line with the year and the name, beside the branding, placed once', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain(
      `<p class="cg-colophon__copyright">© ${new Date().getFullYear()} The Meridian</p>`,
    )
    expect(footer.match(/Made with Cogenta/g)).toHaveLength(1)
  })

  it('writes no heading of its own: a heading is a word the theme cannot translate', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).not.toMatch(/<h[1-6]/)
  })

  it('renders the name and the navigation for a host that predates theme@1.4', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).not.toContain('cg-colophon__tagline')
    expect(footer).not.toContain('cg-colophon__note')
    expect(footer).not.toContain('cg-colophon__follow')
    // No empty about column either: the links move into its place.
    expect(footer).not.toContain('cg-colophon__about')
    expect(footer).toContain('<div class="cg-colophon__grid"><nav class="cg-colophon__nav"')
  })
})
