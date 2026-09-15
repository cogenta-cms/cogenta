import { readFileSync } from 'node:fs'
import type { ChromeInput, ResolvedWidget, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Maison Verte' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [{ label: 'Menu', href: '/menu', openInNewTab: false, kind: 'url', title: null }],
  tagline: 'Seasonal cooking on the slopes of the Croix-Rousse.',
  footerNote: '8 rue Burdeau\n69001 Lyon',
  social: [{ label: 'Instagram', href: 'https://instagram.com/example' }],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const DEVICES = { desktop: true, tablet: true, mobile: true }

function column(id: string, widget: ResolvedWidget): WidgetAreas[string] {
  return { id, label: id, widgets: [widget] }
}

const FOOTER: WidgetAreas = {
  'footer-1': column('footer-1', {
    id: 'w1',
    type: 'contact',
    title: 'Good to know',
    devices: DEVICES,
    address: '',
    phone: '',
    email: '',
    hours: [{ label: 'Closed', value: 'Sunday and Monday' }],
  }),
  'footer-2': column('footer-2', {
    id: 'w2',
    type: 'cta',
    title: 'Private dining',
    devices: DEVICES,
    heading: 'The room upstairs',
    body: '',
    action: { label: 'Plan a meal upstairs', href: '/private-dining', newTab: false },
  }),
}

const STYLES = new URL('../src/styles/', import.meta.url)
const WIDGETS_CSS = readFileSync(new URL('widgets.css', STYLES), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const BASE_CSS = readFileSync(new URL('base.css', STYLES), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function body(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('sets the footer columns inside the charcoal footer, after the profiles and before the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets cr-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('cr-footer__follow'))
    expect(widgets).toBeGreaterThan(footer.indexOf('cr-footer__note'))
    expect(widgets).toBeLessThan(footer.indexOf('cr-footer__legal'))
    expect(footer).toContain('data-columns="2"')
    expect(footer).toContain('<h2 class="cg-widget__title">Good to know</h2>')
    expect(footer.match(/<footer/g)).toHaveLength(1)
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cr-footer__widgets')
  })

  it('lets the content column hold the page edges, so a block beside the column has no second gutter', () => {
    expect(WIDGETS_CSS).toMatch(
      /\.cg-sidebar-layout__content :is\(\.cr-container[^{]*\{\s*max-inline-size: none;\s*padding-inline: 0;/,
    )
    expect(body(WIDGETS_CSS, '.cg-sidebar-layout')).toMatch(/padding-inline: var\(--cr-gutter\)/)
  })

  it('keeps host-rendered titles and the closing band styled when they move into the content column', () => {
    expect(BASE_CSS).toContain(':is(.cg-main, .cg-sidebar-layout__content) > .cg-page__title {')
    expect(BASE_CSS).toContain(
      ':is(.cr-main, .cg-sidebar-layout__content) > [data-variant-background]:last-child {',
    )
    expect(BASE_CSS).not.toMatch(/^\.(cg|cr)-main > /m)
  })

  it('labels each group like a section of the menu, over the floor’s capitals', () => {
    const title = body(WIDGETS_CSS, '.cg-widget__title')
    expect(title).toMatch(/color: var\(--cr-brass\)/)
    expect(title).toMatch(/font-variant-caps: all-small-caps/)
    expect(title).toMatch(/text-transform: none/)
    expect(title).toMatch(/border-block-end: var\(--cr-rule\) solid var\(--cr-line-ink\)/)
  })

  it('draws the way to book as the one filled rectangle, and turns it into underlined words on the footer band', () => {
    expect(BASE_CSS).toMatch(/\.cg-action\[data-emphasis="primary"\],\s*\.cg-widget__cta-action \{/)
    const footerAction = body(WIDGETS_CSS, '.cr-footer__widgets .cg-widget__cta-action')
    expect(footerAction).toMatch(/background: transparent/)
    expect(footerAction).toMatch(/text-decoration-line: underline/)
    const search = body(WIDGETS_CSS, '.cg-widget__search-button,\n.cg-widget__jump-button')
    expect(search).toMatch(/background: transparent/)
  })

  it('never repeats the host floor’s rule above the column on a phone', () => {
    expect(body(WIDGETS_CSS, '.cg-sidebar-layout__aside')).toMatch(/border: 0/)
  })
})
