import { readFileSync } from 'node:fs'
import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

/**
 * Widget areas (contract D `theme@1.6`, L30). The host places the page areas
 * in one shared markup (`cg-sidebar-layout`); this theme declares its areas,
 * places the footer columns inside its own footer, and sets the shared markup
 * on its grid. What a stylesheet cannot prove by rendering, this file holds
 * against the stylesheet itself.
 */

const BASE: ChromeInput = {
  site: { name: 'Reference Site' },
  locale: 'en',
  homeHref: '/',
  headerNav: [{ label: 'Blog', href: '/blog', openInNewTab: false, kind: 'url', title: null }],
  footerNav: [
    { label: 'Privacy', href: '/privacy', openInNewTab: false, kind: 'url', title: null },
  ],
  brandingHtml: '<div class="cg-site-footer__branding">credit</div>',
}

const DEVICES = { desktop: true, tablet: true, mobile: true }

const FOOTER: WidgetAreas = {
  'footer-1': {
    id: 'footer-1',
    label: 'Footer, column 1',
    widgets: [
      {
        id: 'w1',
        type: 'links',
        title: 'Read',
        devices: DEVICES,
        items: [{ label: 'All essays', href: '/blog', newTab: false }],
      },
    ],
  },
  'footer-3': {
    id: 'footer-3',
    label: 'Footer, column 3',
    widgets: [
      {
        id: 'w2',
        type: 'contact',
        title: 'Write to us',
        devices: DEVICES,
        address: '14 Headingley Lane',
        phone: '',
        email: 'hello@example.org',
        hours: [],
      },
    ],
  },
  // Page areas never reach the footer, even when a host passes them along.
  sidebar: {
    id: 'sidebar',
    label: 'Sidebar',
    widgets: [
      {
        id: 'w3',
        type: 'search',
        title: 'Search',
        devices: DEVICES,
        action: '/search',
        label: 'Search',
        placeholder: '',
        button: 'Search',
      },
    ],
  },
}

const STYLES = new URL('../src/styles/', import.meta.url)
const css = (name: string): string =>
  readFileSync(new URL(name, STYLES), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('widget areas (theme@1.6)', () => {
  it('declares every standard area, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual([
      'sidebar',
      'content-before',
      'content-after',
      'footer-1',
      'footer-2',
      'footer-3',
      'footer-4',
    ])
    for (const area of widgetAreas) expect(area.label).not.toBe('')
  })

  it('sets the footer columns inside its own footer, after the menu and before the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf(
      '<div class="cg-footer-widgets cg-site-footer__widgets" data-columns="2">',
    )
    expect(widgets).toBeGreaterThan(footer.indexOf('cg-site-footer__nav'))
    expect(widgets).toBeLessThan(footer.indexOf('cg-site-footer__legal'))
    expect(footer).toContain('<h2 class="cg-widget__title">Read</h2>')
    expect(footer).toContain('<h2 class="cg-widget__title">Write to us</h2>')
    expect(footer).not.toContain('data-area="sidebar"')
  })

  it('renders the footer exactly as before when no footer column has a widget', () => {
    const plain = renderChrome(BASE).footer
    expect(renderChrome({ ...BASE, widgets: {} }).footer).toBe(plain)
    expect(
      renderChrome({
        ...BASE,
        widgets: { 'footer-2': { id: 'footer-2', label: 'Footer, column 2', widgets: [] } },
      }).footer,
    ).toBe(plain)
    expect(plain).not.toContain('cg-site-footer__widgets')
  })

  it('imports the widget stylesheet last, so it can reset blocks inside the content column', () => {
    const imports = [...css('theme.css').matchAll(/@import\s+"([^"]+)"/g)].map((match) => match[1])
    expect(imports.at(-1)).toBe('./widgets.css')
  })

  it('keeps every rule that reads a child of <main> true inside the sidebar layout', () => {
    for (const sheet of ['base.css', 'chrome.css', 'blocks.css', 'listings.css', 'archive.css']) {
      expect(css(sheet), sheet).not.toMatch(/\.cg-main\s*>/)
    }
    for (const sheet of ['utility.css', 'widgets.css']) {
      expect(css(sheet), sheet).not.toMatch(/(?<!\(\s*)\.cg-main\s*>/)
    }
    expect(css('utility.css')).toMatch(
      /:is\(\.cg-main, \.cg-sidebar-layout__content\) > \.cg-form__error/,
    )
  })

  it('holds the layout on the page inset and the twelve-column grid on a wide screen', () => {
    const sheet = css('widgets.css')
    expect(sheet).toMatch(/\.cg-sidebar-layout\s*\{[^}]*padding-inline:\s*var\(--cg-inset\)/)
    expect(sheet).toMatch(
      /@media \(min-width: 64rem\)\s*\{\s*\.cg-sidebar-layout\s*\{\s*grid-template-columns:\s*repeat\(var\(--cg-columns\), minmax\(0, 1fr\)\)/,
    )
    expect(sheet).toMatch(/\.cg-sidebar-layout__content\s*\{[^}]*grid-column:\s*1 \/ span 8/)
    expect(sheet).toMatch(/\.cg-sidebar-layout__aside\s*\{[^}]*grid-column:\s*9 \/ -1/)
  })

  it('puts every block of the content column on the column edges by zeroing the page inset there', () => {
    expect(css('widgets.css')).toMatch(/\.cg-sidebar-layout__content\s*\{[^}]*--cg-inset:\s*0px/)
  })

  it('overrides what the host floor would otherwise leave: the width, the uppercase title, the mobile rule', () => {
    const sheet = css('widgets.css')
    expect(sheet).toMatch(/\.cg-sidebar-layout\s*\{[^}]*inline-size:\s*auto[^}]*margin-inline:\s*0/)
    expect(sheet).toMatch(/\.cg-widget__title\s*\{[^}]*text-transform:\s*none/)
    expect(sheet).toMatch(
      /\.cg-widget__title\s*\{[^}]*letter-spacing:\s*var\(--cg-tracking-heading\)/,
    )
    expect(sheet).toMatch(/\.cg-sidebar-layout__aside\s*\{[^}]*border-block-start:\s*0/)
    expect(sheet).toMatch(/\.cg-widget-area--placed\s*\{[^}]*inline-size:\s*auto/)
  })

  it('opens a widget under a rule in ink, as a section title does', () => {
    expect(css('widgets.css')).toMatch(
      /\.cg-widget__title\s*\{[^}]*border-block-start:\s*var\(--cg-rule\) solid var\(--cg-ink\)/,
    )
  })

  it('styles every element class the shared widget renderer emits', () => {
    // The renderer as this theme actually resolves it: the installed
    // `@cogenta/theme-kit`, next to its entry point.
    const renderer = readFileSync(
      new URL('widgets.js', import.meta.resolve('@cogenta/theme-kit')),
      'utf8',
    )
    const emitted = new Set([...renderer.matchAll(/cg-widget__[a-z-]+/g)].map((match) => match[0]))
    // Class names the renderer builds from a prefix (`${className}-item`).
    for (const derived of ['terms', 'archives']) {
      for (const suffix of ['item', 'label', 'count'])
        emitted.add(`cg-widget__${derived}-${suffix}`)
    }
    const sheet = css('widgets.css')
    const unstyled = [...emitted].filter((name) => !new RegExp(`\\.${name}(?![a-z-])`).test(sheet))
    expect(unstyled).toEqual([])
  })
})
