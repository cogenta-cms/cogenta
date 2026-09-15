import { readdirSync, readFileSync } from 'node:fs'
import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Relay Docs' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [
    {
      label: 'Get started',
      href: null,
      openInNewTab: false,
      kind: 'submenu-placeholder',
      title: null,
    },
    {
      label: 'Quickstart',
      href: '/docs/quickstart',
      openInNewTab: false,
      kind: 'url',
      title: null,
    },
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
        title: 'Status',
        devices: { desktop: true, tablet: true, mobile: true },
        items: [{ label: 'System status', href: '/status', newTab: false }],
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

  it('sets the footer columns inside its footer, after the navigation and before the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets cd-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('cd-footer__nav'))
    expect(widgets).toBeLessThan(footer.indexOf('cd-footer__legal'))
    expect(footer).toContain('<h2 class="cg-widget__title">Status</h2>')
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cd-footer__widgets')
  })
})

describe('the page rail on the documentation grid', () => {
  const widgets = css('widgets.css')

  it('loads the widget stylesheet after every other sheet', () => {
    const imports = [...css('theme.css').matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1])
    expect(imports.at(-1)).toBe('./widgets.css')
  })

  it('lets the documentation layout and the content wrapper step aside, so one grid holds every part', () => {
    expect(widgets).toMatch(
      /\.cd-doc \.cg-sidebar-layout__content,\s*\.cd-doc \.cg-sidebar-layout \.cd-doc__layout\s*\{[^}]*display:\s*contents/,
    )
  })

  it('keeps three columns at the wide breakpoint: navigation, article, rail, never a fourth', () => {
    expect(widgets).toMatch(
      /@media \(min-width: 80rem\)\s*\{\s*\.cd-doc \.cg-sidebar-layout\s*\{[^}]*grid-template-columns:\s*var\(--cd-sidebar\) minmax\(0, 1fr\) var\(--cd-toc\);/,
    )
  })

  it('shares the rail: "On this page" above in the flexible row, the widgets in the row that ends with the article', () => {
    expect(widgets).toMatch(
      /\.cd-doc \.cg-sidebar-layout\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/,
    )
    expect(widgets).toMatch(/\.cd-doc__article\s*\{[^}]*grid-row:\s*2 \/ 4/)
    expect(widgets).toMatch(/\.cd-doc__toc\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*1 \/ 3/)
    expect(widgets).toMatch(
      /\.cd-doc \.cg-sidebar-layout__aside\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*3;[^}]*align-self:\s*end/,
    )
  })

  it('gives the whole rail to the widgets on a page with no contents to list', () => {
    expect(widgets).toMatch(
      /\.cd-doc\[data-toc="false"\] \.cg-sidebar-layout__aside\s*\{[^}]*position:\s*sticky;[^}]*grid-row:\s*1 \/ -1/,
    )
  })

  it('never insets a block, an archive or a host page twice inside the content column', () => {
    expect(widgets).toMatch(
      /\.cg-sidebar-layout__content :is\(\.cd-container, \.cd-archive__inner, \.cg-comments\)\s*\{[^}]*padding-inline:\s*0/,
    )
  })

  it('writes no child combinator from <main> that the layout wrapper would break', () => {
    const offenders = readdirSync(STYLES)
      .filter((name) => name.endsWith('.css'))
      .filter((name) => /(^|[\s,}])\.cg-main\s*>/m.test(css(name)))
    expect(offenders).toEqual([])
  })

  it('draws no card: no shadow, no capitals, no rounded pill on a widget', () => {
    expect(widgets).not.toMatch(/box-shadow/)
    expect(widgets).not.toMatch(/text-transform:\s*uppercase/)
    expect(widgets).not.toMatch(/border-radius:\s*(999|50%|9999)/)
  })
})
