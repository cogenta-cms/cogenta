import type { ChromeInput } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'

const BASE: ChromeInput = {
  site: { name: 'Field Notes' },
  locale: 'en',
  homeHref: '/',
  headerNav: [
    { label: 'Archive', href: '/archive', openInNewTab: false, kind: 'internal', title: null },
    { label: 'About', href: '/about', openInNewTab: false, kind: 'internal', title: null },
  ],
  footerNav: [
    { label: 'Archive', href: '/archive', openInNewTab: false, kind: 'internal', title: null },
    { label: 'About', href: '/about', openInNewTab: false, kind: 'internal', title: null },
    { label: 'Feed', href: '/feed.xml', openInNewTab: false, kind: 'internal', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const FULL: ChromeInput = {
  ...BASE,
  tagline: 'Essays and letters on reading, writing and walking.',
  footerNote: 'Written in Leeds and on the train to York.',
  social: [
    { label: 'Mastodon', href: 'https://mastodon.social/@example' },
    { label: 'Bluesky', href: 'https://bsky.app/profile/example.bsky.social' },
  ],
  headerAction: { label: 'Subscribe', href: '/newsletter' },
}

describe('renderChrome, the header', () => {
  it('sets the publication name as the home link, in its own element for the text face', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(
      '<a class="cg-site-header__home" href="/"><span class="cg-site-header__name">Field Notes</span></a>',
    )
  })

  it('makes the masthead the one sticky header, with the section bar as its own navigation landmark after it', () => {
    const { header } = renderChrome(BASE)
    expect(header.match(/<header /g)).toHaveLength(1)
    expect(header.match(/<nav /g)).toHaveLength(1)
    expect(header.indexOf('</header>')).toBeLessThan(header.indexOf('<nav'))
    expect(header).toMatch(
      /<nav class="cg-sections" id="cg-nav" aria-label="Primary"><div class="cg-sections__inner"><ul class="cg-nav__items">[\s\S]*href="\/archive"[\s\S]*href="\/about"[\s\S]*<\/nav>/,
    )
  })

  it('needs no menu to open: no checkbox, no script, no handler, whatever the screen', () => {
    const { header } = renderChrome(FULL)
    expect(header).not.toContain('<input')
    expect(header).not.toContain('cg-nav-toggle')
    expect(header).not.toMatch(/<script|\son[a-z]+="/i)
  })

  it('renders no section bar when there is nothing to navigate to', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).not.toContain('<nav')
    expect(header).not.toContain('cg-sections')
  })

  it('renders the header action alone, in the masthead, with no nav links', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [],
      headerAction: { label: 'Subscribe', href: '/newsletter' },
    })
    expect(header).toMatch(/<a class="cg-action cg-site-header__action"[^>]*>Subscribe<\/a>/)
    expect(header).not.toContain('<nav')
  })

  it('draws the header action as a plain link the stylesheet fills, in the masthead after the toggle', () => {
    const { header } = renderChrome(FULL)
    expect(header).toMatch(/data-emphasis="outline" href="\/newsletter">Subscribe</)
    expect(header.indexOf('data-cg-theme-toggle')).toBeLessThan(
      header.indexOf('cg-site-header__action'),
    )
    expect(header.indexOf('cg-site-header__action')).toBeLessThan(header.indexOf('</header>'))
  })

  it('renders an unlinked submenu placeholder as a span, never a dead link', () => {
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
        ...BASE.headerNav,
      ],
    })
    expect(header).toContain('<span>More</span>')
  })

  it('drops a link with no destination that is not a placeholder', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [{ label: 'Gone', href: null, openInNewTab: false, kind: 'url', title: null }],
    })
    expect(header).not.toContain('Gone')
  })

  it('writes a link title as a tooltip without replacing its label', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Archive',
          href: '/archive',
          openInNewTab: false,
          kind: 'url',
          title: 'Every essay',
        },
      ],
    })
    expect(header).toContain('<a href="/archive" title="Every essay">Archive</a>')
  })

  it('escapes a site name that contains markup-significant characters', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: 'A & B <Co>' } })
    expect(header).toContain('A &amp; B &lt;Co&gt;')
    expect(footer).toContain('A &amp; B &lt;Co&gt;')
    expect(header).not.toContain('<Co>')
  })
})

describe('renderChrome, the manual light/dark toggle', () => {
  it('renders the toggle button, byte-identical to renderThemeToggle', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain(serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' })))
  })

  it('still renders the toggle when there is no nav at all', () => {
    const { header } = renderChrome({ ...BASE, headerNav: [] })
    expect(header).toContain('data-cg-theme-toggle')
  })

  it('places the toggle in the masthead, before the section bar', () => {
    const { header } = renderChrome(FULL)
    expect(header.indexOf('data-cg-theme-toggle')).toBeLessThan(header.indexOf('<nav'))
  })

  it('reflects the locale passed to renderChrome', () => {
    const { header } = renderChrome({ ...BASE, locale: 'fr' })
    expect(header).toContain(serialize(renderThemeToggle('fr', { className: 'cg-theme-toggle' })))
  })
})

describe('renderChrome, the footer', () => {
  it('renders every footer link in its own navigation landmark', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toMatch(/<nav class="cg-site-footer__nav" aria-label="Footer">/)
    for (const href of ['/archive', '/about', '/feed.xml'])
      expect(footer).toContain(`href="${href}"`)
  })

  it('places the branding fragment inside the footer, exactly once and unmodified', () => {
    const { footer } = renderChrome(BASE)
    expect(footer.split('Made with Cogenta')).toHaveLength(2)
    expect(footer).toContain('<a href="https://cogenta.dev">Made with Cogenta</a>')
  })

  it('writes a legal line with the current year and the site name', () => {
    const { footer } = renderChrome(BASE)
    expect(footer).toContain(`© ${new Date().getFullYear()} Field Notes`)
  })

  it('renders the tagline only when the site set one (theme@1.4, additive)', () => {
    expect(renderChrome(BASE).footer).not.toContain('cg-site-footer__tagline')
    const { footer } = renderChrome(FULL)
    expect(footer).toContain(
      '<p class="cg-site-footer__tagline" data-field="tagline">Essays and letters on reading, writing and walking.</p>',
    )
  })

  it('renders the footer note only when set, one paragraph per blank-line-separated block', () => {
    expect(renderChrome(BASE).footer).not.toContain('cg-site-footer__note')
    const { footer } = renderChrome({ ...BASE, footerNote: 'First line\ncontinued.\n\nSecond.' })
    expect(footer).toContain(
      '<div class="cg-site-footer__note"><p>First line continued.</p><p>Second.</p></div>',
    )
  })

  it('renders social links with real icons and a visually hidden label', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('cg-site-footer__social')
    expect(footer).toContain('<span class="cg-visually-hidden">Mastodon</span>')
    expect(footer.match(/<svg class="cg-social__icon"/g)).toHaveLength(2)
  })

  it('invites a reader with the site action and the feed, and signs the page with the name once more', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toMatch(/data-emphasis="primary" href="\/newsletter">Subscribe</)
    expect(footer).toContain('<a class="cg-site-footer__feed" href="/feed.xml">RSS</a>')
    expect(footer).toContain('<p class="cg-site-footer__name" aria-hidden="true">Field Notes</p>')
    expect(renderChrome(BASE).footer).not.toContain('data-emphasis="primary"')
  })

  it('renders the pre-1.4 shape when none of the new fields are set', () => {
    const { header, footer } = renderChrome(BASE)
    expect(footer).not.toContain('cg-site-footer__tagline')
    expect(footer).not.toContain('cg-site-footer__social')
    expect(footer).not.toContain('cg-site-footer__note')
    expect(header).not.toContain('cg-site-header__action')
  })

  it('opens an external link in a new tab with rel="noopener"', () => {
    const { footer } = renderChrome({
      ...BASE,
      footerNav: [
        {
          label: 'GitHub',
          href: 'https://github.com/example',
          openInNewTab: true,
          kind: 'external',
          title: null,
        },
      ],
    })
    expect(footer).toMatch(
      /<a href="https:\/\/github\.com\/example" target="_blank" rel="noopener">GitHub<\/a>/,
    )
  })

  it('omits the footer navigation landmark when the site has no footer menu', () => {
    const { footer } = renderChrome({ ...BASE, footerNav: [] })
    expect(footer).not.toContain('<nav')
  })

  it('emits no script tag anywhere in the chrome', () => {
    const { header, footer } = renderChrome(FULL)
    expect(header).not.toMatch(/<script/i)
    expect(footer).not.toMatch(/<script/i)
  })
})

describe('renderChrome, the language switcher (theme@1.10)', () => {
  const LANGUAGES = [
    { locale: 'fr', label: 'Français', href: '/blog/bonjour', current: true },
    { locale: 'en', label: 'English', href: '/en/blog/hello', current: false },
  ] as const

  it('draws nothing on a site with one language', () => {
    expect(renderChrome(BASE).header).not.toContain('cg-lang')
    expect(renderChrome({ ...BASE, languages: [LANGUAGES[0]] }).header).not.toContain('cg-lang')
  })

  it('links the translation of the page, in the masthead and not in the section bar', () => {
    const { header } = renderChrome({ ...BASE, locale: 'fr', languages: LANGUAGES })
    expect(header).toContain('<nav class="cg-lang" aria-label="Langue">')
    expect(header).toContain('href="/en/blog/hello" lang="en" hreflang="en"')
    expect(header).toContain('aria-current="true">Français</a>')
    const bar = header.slice(header.indexOf('id="cg-nav"'), header.indexOf('</nav>'))
    expect(bar).not.toContain('cg-lang')
    expect(header.indexOf('cg-lang')).toBeLessThan(header.indexOf('</header>'))
  })
})
