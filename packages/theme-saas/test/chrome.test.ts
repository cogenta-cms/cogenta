import type { ChromeInput, ChromeNavLink } from '@cogenta/theme-kit'
import { renderThemeToggle, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { footerGroups, renderChrome } from '../src/render/chrome.js'

function link(label: string, href: string | null, kind = 'url'): ChromeNavLink {
  return { label, href, openInNewTab: false, kind, title: null }
}

const BASE: ChromeInput = {
  site: { name: 'Ledgerline' },
  locale: 'en',
  homeHref: '/en',
  headerNav: [link('Product', '/en/product'), link('Pricing', '/en/pricing')],
  footerNav: [link('Security', '/en/security'), link('Privacy', '/en/privacy')],
  brandingHtml: '<div class="cg-site-footer__branding">Cogenta credit</div>',
}

const GROUPED: readonly ChromeNavLink[] = [
  link('Product', null, 'submenu-placeholder'),
  link('Overview', '/en/product'),
  link('Pricing', '/en/pricing'),
  link('Company', null, 'submenu-placeholder'),
  link('About', '/en/about'),
  link('Resources', null, 'submenu-placeholder'),
  link('Legal', null, 'submenu-placeholder'),
  link('Privacy', '/en/privacy'),
]

const FULL: ChromeInput = {
  ...BASE,
  footerNav: GROUPED,
  tagline: 'Spend approvals and audit trail for finance teams.',
  social: [{ label: 'LinkedIn', href: 'https://linkedin.com/company/example' }],
  footerNote: '41 Tabernacle Street\nLondon EC2A 4AA\n\nSupport on business days.',
  headerAction: { label: 'Book a demo', href: '/en/demo' },
}

describe('the header', () => {
  it('renders to stable markup', () => {
    expect(renderChrome(FULL).header).toMatchSnapshot()
  })

  it('sets the product’s name as its wordmark, linking home', () => {
    expect(renderChrome(BASE).header).toContain(
      '<a class="cs-header__brand" href="/en"><span class="cs-header__wordmark">Ledgerline</span></a>',
    )
  })

  it('renders every real navigation link', () => {
    const { header } = renderChrome(BASE)
    expect(header).toContain('<li class="cs-header__item"><a href="/en/product">Product</a></li>')
    expect(header).toContain('href="/en/pricing">Pricing</a>')
  })

  it('renders the header action as the one primary button, outside the navigation panel', () => {
    const { header } = renderChrome(FULL)
    expect(header).toContain(
      '<a class="cg-action cs-header__action" data-emphasis="primary" href="/en/demo">Book a demo</a>',
    )
    expect(header.indexOf('</nav>')).toBeLessThan(header.indexOf('cs-header__action'))
    expect(header.match(/data-emphasis="primary"/g)).toHaveLength(1)
  })

  it('keeps the action and the light/dark control when the site has no navigation links', () => {
    const { header } = renderChrome({ ...FULL, headerNav: [] })
    expect(header).toContain('cs-header__action')
    expect(header).toContain('cg-theme-toggle')
    expect(header).not.toContain('cs-nav-toggle')
    expect(header).toContain('data-nav="none"')
  })

  it('draws no signup form, no search field and no button standing in for an account', () => {
    const { header } = renderChrome(FULL)
    expect(header).not.toMatch(/<form|<select|type="(email|password|search)"|sign (up|in)|log in/i)
    expect(header.match(/<button/g)).toHaveLength(1)
  })

  it('ships a CSS-only menu toggle ahead of the one nav it controls', () => {
    const { header } = renderChrome(BASE)
    expect(header.indexOf('id="cs-nav-toggle"')).toBeLessThan(header.indexOf('id="cs-nav"'))
    expect(header).toMatch(/<input type="checkbox" id="cs-nav-toggle"[^>]*aria-label="Menu"/)
    expect(header).toContain(
      '<label for="cs-nav-toggle" class="cs-nav-toggle-label" aria-hidden="true">',
    )
    expect(header.match(/<nav/g)).toHaveLength(1)
  })

  it('renders a submenu placeholder as an unlinked span, and drops a link with no target', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [link('Solutions', null, 'submenu-placeholder'), link('Ghost', null, 'url')],
    })
    expect(header).toContain('<span>Solutions</span>')
    expect(header).not.toContain('Ghost')
  })

  it('carries a title attribute and a new-tab link through, with noopener', () => {
    const { header } = renderChrome({
      ...BASE,
      headerNav: [
        {
          label: 'Status',
          href: 'https://status.example',
          openInNewTab: true,
          kind: 'url',
          title: 'Uptime',
        },
      ],
    })
    expect(header).toContain('target="_blank" rel="noopener" title="Uptime"')
  })

  it('escapes a site name containing markup', () => {
    const { header, footer } = renderChrome({ ...BASE, site: { name: '<b>Acme</b> Cloud' } })
    expect(header).toContain('&lt;b&gt;Acme&lt;/b&gt; Cloud')
    expect(footer).toContain('&lt;b&gt;Acme&lt;/b&gt; Cloud')
    expect(header + footer).not.toContain('<b>Acme</b>')
  })

  it('renders the theme toggle on every render, localised from the chrome locale', () => {
    expect(renderChrome(BASE).header).toContain(
      serialize(renderThemeToggle('en', { className: 'cg-theme-toggle' })),
    )
    expect(renderChrome({ ...BASE, locale: 'fr' }).header).toContain(
      serialize(renderThemeToggle('fr', { className: 'cg-theme-toggle' })),
    )
  })

  it('emits no script tag and no inline handler', () => {
    const { header, footer } = renderChrome(FULL)
    expect(header + footer).not.toMatch(/<script|\son[a-z]+="/i)
  })
})

describe('the footer columns', () => {
  it('starts a column at each unlinked heading and fills it with the links that follow', () => {
    expect(
      footerGroups(GROUPED).map((group) => [group.heading, group.links.map((l) => l.label)]),
    ).toEqual([
      ['Product', ['Overview', 'Pricing']],
      ['Company', ['About']],
      ['Legal', ['Privacy']],
    ])
  })

  it('drops a heading with no link under it, rather than printing an empty column', () => {
    expect(renderChrome(FULL).footer).not.toContain('Resources')
  })

  it('keeps a flat footer menu as one column without a heading', () => {
    const groups = footerGroups(BASE.footerNav)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.heading).toBeNull()
    const { footer } = renderChrome(BASE)
    expect(footer).toContain('data-columns="1"')
    expect(footer).not.toContain('cs-footer__heading')
  })

  it('keeps links placed before the first heading in their own column', () => {
    const groups = footerGroups([link('Home', '/en'), ...GROUPED])
    expect(groups[0]).toEqual({ heading: null, links: [link('Home', '/en')] })
    expect(groups).toHaveLength(4)
  })

  it('names each column in a labelled navigation and caps the grid at four columns', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('<nav class="cs-footer__nav" aria-label="Footer" data-columns="3">')
    expect(footer).toContain('<p class="cs-footer__heading">Product</p>')
    expect(footer).toContain('<li class="cs-footer__item"><a href="/en/about">About</a></li>')
  })

  it('renders no footer navigation when there is none', () => {
    expect(renderChrome({ ...BASE, footerNav: [] }).footer).not.toContain('cs-footer__nav')
  })
})

describe('the footer', () => {
  it('renders to stable markup', () => {
    const { footer } = renderChrome(FULL)
    expect(footer.replace(/© \d{4}/, '© YEAR')).toMatchSnapshot()
  })

  it('writes the copyright year and the product’s name on the legal line', () => {
    expect(renderChrome(BASE).footer).toContain(
      `<p class="cs-footer__copyright">© ${new Date().getFullYear()} Ledgerline</p>`,
    )
  })

  it('places the branding fragment once, byte for byte', () => {
    expect(
      renderChrome(BASE).footer.split('<div class="cg-site-footer__branding">Cogenta credit</div>'),
    ).toHaveLength(2)
  })

  it('renders no branding wrapper when the fragment is empty', () => {
    expect(renderChrome({ ...BASE, brandingHtml: '' }).footer).not.toContain('cs-footer__branding')
  })

  it('sets the tagline under the name when set, and nothing when absent', () => {
    expect(renderChrome(FULL).footer).toContain(
      '<p class="cs-footer__tagline" data-field="tagline">Spend approvals and audit trail for finance teams.</p>',
    )
    expect(renderChrome(BASE).footer).not.toContain('cs-footer__tagline')
  })

  it('keeps the lines of an address and splits paragraphs at blank lines', () => {
    expect(renderChrome(FULL).footer).toContain(
      '<div class="cs-footer__note"><p>41 Tabernacle Street<br>London EC2A 4AA</p><p>Support on business days.</p></div>',
    )
  })

  it('reads Windows line endings as line endings, and escapes markup in the note', () => {
    expect(renderChrome({ ...BASE, footerNote: 'One\r\nTwo\r\n\r\nThree' }).footer).toContain(
      '<p>One<br>Two</p><p>Three</p>',
    )
    const { footer } = renderChrome({ ...BASE, footerNote: '<script>x</script>' })
    expect(footer).toContain('&lt;script&gt;x&lt;/script&gt;')
  })

  it('renders social profiles with their icons, and nothing when there are none', () => {
    const { footer } = renderChrome(FULL)
    expect(footer).toContain('<ul class="cs-footer__social">')
    expect(footer).toContain('https://linkedin.com/company/example')
    expect(renderChrome(BASE).footer).not.toContain('cs-footer__social')
  })

  it('renders none of the theme@1.4 fields when absent, as a pre-1.4 site did', () => {
    const { header, footer } = renderChrome(BASE)
    for (const piece of [
      'cs-header__action',
      'cs-footer__tagline',
      'cs-footer__note',
      'cs-footer__social',
    ]) {
      expect(header + footer).not.toContain(piece)
    }
  })
})
