import { readFileSync } from 'node:fs'
import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Ledgerline' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [
    { label: 'Product', href: null, openInNewTab: false, kind: 'submenu-placeholder', title: null },
    { label: 'Pricing', href: '/pricing', openInNewTab: false, kind: 'url', title: null },
  ],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const FOOTER: WidgetAreas = {
  'footer-1': {
    id: 'footer-1',
    label: 'Footer, column 1',
    widgets: [
      {
        id: 'w1',
        type: 'links',
        title: 'Developers',
        devices: { desktop: true, tablet: true, mobile: true },
        items: [{ label: 'API reference', href: '/features/api-and-webhooks', newTab: false }],
      },
    ],
  },
}

const WIDGETS_CSS = readFileSync(new URL('../src/styles/widgets.css', import.meta.url), 'utf8')
const BASE_CSS = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8')

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('sets the footer columns inside its own footer, after the pages and before the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets cs-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('cs-footer__nav'))
    expect(widgets).toBeLessThan(footer.indexOf('cs-footer__legal'))
    expect(footer).toContain('<h2 class="cg-widget__title">Developers</h2>')
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cs-footer__widgets')
  })

  it('lets the content column hold the page edges, so a block beside the side column has no second gutter', () => {
    expect(WIDGETS_CSS).toMatch(
      /\.cg-sidebar-layout__content :is\(\.cs-container[^{]*\{\s*max-inline-size: none;\s*padding-inline: 0;/,
    )
  })

  it('keeps the page title of a host-rendered page styled when it moves into the content column', () => {
    expect(BASE_CSS).toContain(':is(.cg-main, .cg-sidebar-layout__content) > .cg-page__title {')
    expect(BASE_CSS).not.toMatch(/^\.cg-main > /m)
  })

  it('draws the call to action as the one primary button, and the column search as a quiet control', () => {
    expect(BASE_CSS).toMatch(/\.cg-action\[data-emphasis="primary"\],\s*\.cg-widget__cta-action \{/)
    const search = /\.cg-widget__search-button,\s*\.cg-widget__jump-button \{([^}]*)\}/.exec(
      WIDGETS_CSS,
    )?.[1]
    expect(search).toBeDefined()
    expect(search).not.toMatch(/--cs-accent/)
  })
})
