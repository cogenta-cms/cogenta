import { readFileSync } from 'node:fs'
import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Common Ground' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [
    {
      label: 'Get involved',
      href: null,
      openInNewTab: false,
      kind: 'submenu-placeholder',
      title: null,
    },
    { label: 'Ways to give', href: '/donate', openInNewTab: false, kind: 'url', title: null },
  ],
  footerNote: 'The Old Library\n220 Elm Street',
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const FOOTER: WidgetAreas = {
  'footer-2': {
    id: 'footer-2',
    label: 'Footer, column 2',
    widgets: [
      {
        id: 'w1',
        type: 'links',
        title: 'Partners',
        devices: { desktop: true, tablet: true, mobile: true },
        items: [{ label: 'The Linden Trust', href: '/about', newTab: false }],
      },
    ],
  },
}

const STYLES = new URL('../src/styles/', import.meta.url)
const css = (name: string): string =>
  readFileSync(new URL(name, STYLES), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const SHEETS = [
  'base.css',
  'chrome.css',
  'blocks.css',
  'listings.css',
  'archive.css',
  'widgets.css',
]

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('sets the footer columns on its green band, under the menu and above the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets ca-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('ca-footer__nav'))
    expect(widgets).toBeLessThan(footer.indexOf('ca-footer__legal'))
    expect(footer).toContain('<h2 class="cg-widget__title">Partners</h2>')
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('ca-footer__widgets')
  })

  it('imports the widget stylesheet last, so it can set the blocks inside the content column', () => {
    const imports = [...css('theme.css').matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1])
    expect(imports.at(-1)).toBe('./widgets.css')
  })

  it('keeps every rule that reads a child of <main> true inside the sidebar layout', () => {
    for (const sheet of SHEETS) {
      // A child of <main> is written `:is(.ca-main, .cg-sidebar-layout__content) >`,
      // never `.ca-main >` alone, which the host's wrapper would break.
      expect(css(sheet).match(/\.c[ga]-main\s*>/g) ?? [], sheet).toEqual([])
    }
  })

  it('never doubles the gutters: the content column zeroes its containers’ own', () => {
    const sheet = css('widgets.css')
    expect(sheet).toMatch(
      /\.cg-sidebar-layout\s*\{[^}]*max-inline-size:\s*calc\(var\(--ca-page\) \+ var\(--ca-gutter\) \* 2\)[^}]*padding-inline:\s*var\(--ca-gutter\)/,
    )
    expect(sheet).toMatch(
      /\.cg-sidebar-layout__content\s*:is\([^)]*\.ca-container[^)]*\)\s*\{[^}]*padding-inline:\s*0/,
    )
  })

  it('sets the side column beside the content only on a wide screen', () => {
    expect(css('widgets.css')).toMatch(
      /@media \(min-width: 64rem\)\s*\{\s*\.cg-sidebar-layout\s*\{[^}]*grid-template-columns/,
    )
  })

  it('keeps the yellow for the header’s donation ask: no widget is painted with it', () => {
    expect(css('widgets.css')).not.toMatch(/--ca-signal/)
  })
})
