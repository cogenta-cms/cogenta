import { readdirSync, readFileSync } from 'node:fs'
import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Field Notes' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [
    { label: 'Archive', href: '/archive', openInNewTab: false, kind: 'internal', title: null },
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
        title: 'Elsewhere',
        devices: { desktop: true, tablet: true, mobile: true },
        items: [{ label: 'Reading list', href: '/reading', newTab: false }],
      },
    ],
  },
}

const STYLES = new URL('../src/styles/', import.meta.url)
const css = (name: string): string =>
  readFileSync(new URL(name, STYLES), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('sets the footer columns inside the colophon, after its columns and before the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets cg-site-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('cg-site-footer__top'))
    expect(widgets).toBeLessThan(footer.indexOf('cg-site-footer__bottom'))
    expect(footer).toContain('<h2 class="cg-widget__title">Elsewhere</h2>')
  })

  it('renders the colophon exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cg-site-footer__widgets')
  })
})

describe('the sidebar layout on the grid', () => {
  it('loads the widget stylesheet after every other sheet', () => {
    const imports = [...css('theme.css').matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1])
    expect(imports.at(-1)).toBe('./widgets.css')
  })

  it('keeps the page twelve columns wide and gives the content nine of them, the sidebar three', () => {
    const widgets = css('widgets.css')
    expect(widgets).toMatch(
      /\.cg-sidebar-layout\s*\{[^}]*grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/,
    )
    expect(widgets).toMatch(/\.cg-sidebar-layout__content\s*\{[^}]*--cg-columns:\s*9;/)
    expect(widgets).toMatch(/\.cg-sidebar-layout__aside\s*\{[^}]*grid-column:\s*10 \/ -1/)
  })

  it('never insets a block twice inside the content column', () => {
    expect(css('widgets.css')).toMatch(
      /\.cg-sidebar-layout__content :is\(\.cg-container, \.cg-comments\)\s*\{[^}]*padding-inline:\s*0/,
    )
  })

  it('writes no child combinator from <main> that the layout wrapper would break', () => {
    const offenders = readdirSync(STYLES)
      .filter((name) => name.endsWith('.css'))
      .filter((name) => /(^|[\s,}])\.cg-main\s*>/m.test(css(name)))
    expect(offenders).toEqual([])
  })
})
