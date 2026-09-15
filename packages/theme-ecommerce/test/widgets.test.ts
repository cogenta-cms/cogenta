import { readFileSync } from 'node:fs'
import type { ChromeInput, ResolvedWidget, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Atelier Goods' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [
    {
      label: 'Delivery and returns',
      href: '/delivery-and-returns',
      openInNewTab: false,
      kind: 'url',
      title: null,
    },
  ],
  tagline: 'Everyday goods, made to last and to be mended.',
  footerNote: 'Rua da Boavista 84, 1200-066 Lisboa, Portugal.',
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
    title: 'Call the shop',
    devices: DEVICES,
    address: '',
    phone: '+351 213 460 218',
    email: '',
    hours: [{ label: 'Answered', value: 'Tuesday to Saturday, during opening hours' }],
  }),
  'footer-2': column('footer-2', {
    id: 'w2',
    type: 'cta',
    title: 'Letters from the workshop',
    devices: DEVICES,
    heading: 'Four letters a year',
    body: '',
    action: { label: 'How to ask for them', href: '/contact', newTab: false },
  }),
}

const STYLES = new URL('../src/styles/', import.meta.url)
const css = (name: string): string =>
  readFileSync(new URL(name, STYLES), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const WIDGETS_CSS = css('widgets.css')
const BASE_CSS = css('base.css')

function body(source: string, selector: string): string {
  const at = source.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return source.slice(at, source.indexOf('}', at))
}

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('sets the footer columns inside the stone footer, after the profiles and before the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets ce-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('ce-footer__follow'))
    expect(widgets).toBeGreaterThan(footer.indexOf('ce-footer__nav'))
    expect(widgets).toBeLessThan(footer.indexOf('ce-footer__legal'))
    expect(footer).toContain('data-columns="2"')
    expect(footer).toContain('<h2 class="cg-widget__title">Call the shop</h2>')
    expect(footer.match(/<footer/g)).toHaveLength(1)
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('ce-footer__widgets')
  })

  it('loads the widget stylesheet after every other sheet', () => {
    const imports = [...css('theme.css').matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1])
    expect(imports.at(-1)).toBe('./widgets.css')
  })
})

describe('the side column in the shop’s register', () => {
  it('lets the content column hold the page edges, so a block beside the column has no second gutter', () => {
    expect(WIDGETS_CSS).toMatch(
      /\.cg-sidebar-layout__content :is\(\.ce-container[^{]*\{\s*max-inline-size: none;\s*padding-inline: 0;/,
    )
    expect(body(WIDGETS_CSS, '.cg-sidebar-layout')).toMatch(/padding-inline: var\(--ce-gutter\)/)
  })

  it('keeps host-rendered page titles styled when they move into the content column', () => {
    expect(BASE_CSS).toContain(':is(.cg-main, .cg-sidebar-layout__content) > .cg-page__title {')
    expect(BASE_CSS).not.toMatch(/^\.cg-main > /m)
  })

  it('sets a group as the product sheet sets its details: a caption, then ruled rows', () => {
    const title = body(WIDGETS_CSS, '.cg-widget__title')
    expect(title).toMatch(/font-size: var\(--ce-text-caption\)/)
    expect(title).toMatch(/font-weight: var\(--ce-weight-medium\)/)
    expect(title).toMatch(/text-transform: none/)
    expect(WIDGETS_CSS).toMatch(
      /\.cg-widget__toc-item\s*\)\s*\{[^}]*border-block-start: var\(--ce-rule\) solid var\(--ce-line\)/,
    )
  })

  it('keeps the one filled ink rectangle for the page: a call to action is an arrow link, a search button is words', () => {
    const action = body(WIDGETS_CSS, '.cg-widget__form-link')
    expect(action).toMatch(/background: transparent/)
    expect(action).not.toMatch(/--ce-action\b/)
    expect(WIDGETS_CSS).toMatch(/\.cg-widget__cta-action::after,[^{]*\{\s*content: "\\2192" \/ "";/)
    const search = body(WIDGETS_CSS, '.cg-widget__jump-button')
    expect(search).toMatch(/background: transparent/)
    expect(search).toMatch(/text-decoration-line: underline/)
  })

  it('sets every widget heading in the shop’s own face, never the floor’s serif', () => {
    expect(body(WIDGETS_CSS, '.cg-widget__cta-heading')).toMatch(/font-family: var\(--ce-font\)/)
    expect(body(WIDGETS_CSS, '.cg-widget__quote-text p')).toMatch(/font-family: var\(--ce-font\)/)
  })

  it('crops an entry’s photograph to the goods’ 4:5 on the plate, with nothing else', () => {
    const image = body(WIDGETS_CSS, '.cg-widget__entry-image')
    expect(image).toMatch(/aspect-ratio: 4 \/ 5/)
    expect(image).toMatch(/background: var\(--ce-plate\)/)
    expect(image).not.toMatch(/radius|shadow|border:/)
  })

  it('draws a strip of entries with photographs on the goods grid: two, three, four across, three beside the column', () => {
    expect(WIDGETS_CSS).toMatch(
      /\.cg-widget__entries:has\(> \.cg-widget__entry\[data-image="image"\]\) \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    )
    expect(WIDGETS_CSS).toMatch(
      /min-width: 64rem\)\s*\{[^}]*\.cg-widget__entries:has\(> \.cg-widget__entry\[data-image="image"\]\) \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/,
    )
    expect(WIDGETS_CSS).not.toMatch(/auto-fill/)
  })

  it('starts each footer column on a column of the row above on a desk', () => {
    expect(WIDGETS_CSS).toMatch(
      /\.ce-footer__widgets > \.cg-widget-area:nth-child\(1\) \{\s*grid-column: 1 \/ span 5;/,
    )
    expect(WIDGETS_CSS).toMatch(
      /\.ce-footer__widgets > \.cg-widget-area:nth-child\(2\) \{\s*grid-column: 7 \/ span 3;/,
    )
  })

  it('writes no gradient, no shadow and no rounded card anywhere in the widgets', () => {
    expect(WIDGETS_CSS).not.toMatch(/gradient\(|box-shadow|border-radius|backdrop-filter/)
  })
})
