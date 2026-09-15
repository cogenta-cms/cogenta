import { readFileSync } from 'node:fs'
import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Northfield Partners' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [{ label: 'About', href: '/about', openInNewTab: false, kind: 'url', title: null }],
  footerNote: 'London\n12 Hanover Square',
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
        title: 'Research',
        devices: { desktop: true, tablet: true, mobile: true },
        items: [{ label: 'Working papers', href: '/research', newTab: false }],
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

  it('sets the footer columns inside its own footer, under the colophon and above the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets cg-site-footer__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('cg-site-footer__note'))
    expect(widgets).toBeLessThan(footer.indexOf('cg-site-footer__bottom'))
    expect(footer).toContain('<h2 class="cg-widget__title">Research</h2>')
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cg-site-footer__widgets')
  })

  it('imports the widget stylesheet last, so it can set the blocks inside the content column', () => {
    const imports = [...css('theme.css').matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1])
    expect(imports.at(-1)).toBe('./widgets.css')
  })

  it('keeps every rule that reads a child of <main> true inside the sidebar layout', () => {
    for (const sheet of ['base.css', 'blocks.css', 'archive.css', 'widgets.css']) {
      expect(css(sheet)).not.toMatch(/(?<![,(]\s*)\.cg-main\s*>/)
    }
  })

  it('sets the side column on the page edges, beside the content only on a wide screen', () => {
    const sheet = css('widgets.css')
    expect(sheet).toMatch(
      /\.cg-sidebar-layout\s*\{[^}]*max-inline-size:\s*calc\(var\(--cg-page\) \+ var\(--cg-gutter\) \* 2\)[^}]*padding-inline:\s*var\(--cg-gutter\)/,
    )
    expect(sheet).toMatch(
      /@media \(min-width: 64rem\)\s*\{\s*\.cg-sidebar-layout\s*\{[^}]*grid-template-columns/,
    )
  })
})
