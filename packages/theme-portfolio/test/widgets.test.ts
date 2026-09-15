import { readFileSync } from 'node:fs'
import type { ChromeInput, ResolvedWidget, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'Studio Hale' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [{ label: 'Work', href: '/work', openInNewTab: false, kind: 'url', title: null }],
  tagline: 'Identity, print, wayfinding and exhibitions.',
  footerNote: 'Second floor, 41 Hatherley Mews, London.',
  social: [{ label: 'Instagram', href: 'https://instagram.com/example' }],
  brandingHtml: '<a href="https://cogenta.dev">Made with Cogenta</a>',
}

const DEVICES = { desktop: true, tablet: true, mobile: true }

const NEW_WORK: ResolvedWidget = {
  id: 'w1',
  type: 'cta',
  title: 'New work',
  devices: DEVICES,
  heading: 'Tell us what you are making.',
  body: 'Mara Lindgren replies to every enquiry within two working days.',
  action: { label: 'Start a project', href: '/contact', newTab: false },
}

function areas(...widgets: readonly [string, ResolvedWidget][]): WidgetAreas {
  return Object.fromEntries(
    widgets.map(([id, widget]) => [id, { id, label: id, widgets: [widget] }] as const),
  )
}

const STYLES = new URL('../src/styles/', import.meta.url)
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')
const WIDGETS_CSS = strip(readFileSync(new URL('widgets.css', STYLES), 'utf8'))
const BASE_CSS = strip(readFileSync(new URL('base.css', STYLES), 'utf8'))

function body(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('opens the footer on its widget tier, before the name, the pages, the profiles and the legal line', () => {
    const { footer } = renderChrome({ ...BASE, widgets: areas(['footer-1', NEW_WORK]) })
    const tier = footer.indexOf('<div class="cg-footer-widgets cg-colophon__widgets"')
    expect(tier).toBeGreaterThan(footer.indexOf('<div class="cg-colophon__inner">'))
    expect(tier).toBeLessThan(footer.indexOf('cg-colophon__about'))
    expect(tier).toBeLessThan(footer.indexOf('cg-colophon__follow'))
    expect(tier).toBeLessThan(footer.indexOf('cg-colophon__legal'))
    expect(footer).toContain('data-columns="1"')
    expect(footer).toContain('<h2 class="cg-widget__title">New work</h2>')
    expect(footer.match(/<footer/g)).toHaveLength(1)
  })

  it('renders the footer exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cg-colophon__widgets')
  })

  it('counts only the footer columns that hold a widget', () => {
    const { footer } = renderChrome({
      ...BASE,
      widgets: {
        ...areas(['footer-1', NEW_WORK], ['footer-3', { ...NEW_WORK, id: 'w2' }]),
        'footer-2': { id: 'footer-2', label: 'footer-2', widgets: [] },
      },
    })
    expect(footer).toContain('data-columns="2"')
  })

  it('sets the column on the page grid: content on the first eight columns, widgets on the last three', () => {
    expect(body(WIDGETS_CSS, '.cg-sidebar-layout')).toMatch(
      /max-inline-size: calc\(var\(--cg-page\) \+ var\(--cg-gutter\) \* 2\)/,
    )
    expect(body(WIDGETS_CSS, '.cg-sidebar-layout__content')).toMatch(/min-inline-size: 0/)
    expect(WIDGETS_CSS).toMatch(/\.cg-sidebar-layout__content \{\s*grid-column: 1 \/ span 8;\s*\}/)
    expect(WIDGETS_CSS).toMatch(/\.cg-sidebar-layout__aside \{\s*grid-column: 10 \/ span 3;/)
  })

  it('lets the content column hold the page edges, so a block beside the column has no second gutter', () => {
    expect(WIDGETS_CSS).toMatch(
      /\.cg-sidebar-layout__content :is\(\.cg-container[^{]*\{\s*max-inline-size: none;\s*padding-inline: 0;/,
    )
  })

  it('keeps the first section and the search page styled when they move into the content column', () => {
    expect(BASE_CSS).toContain(
      ':is(.cg-main, .cg-sidebar-layout__content) > .cg-section:first-child {',
    )
    expect(BASE_CSS).toContain(':is(.cg-main, .cg-sidebar-layout__content) > .cg-page__title {')
    expect(BASE_CSS).not.toMatch(/^\.cg-main > /m)
  })

  it('opens every widget like a block of the theme: a hairline in ink and a small label', () => {
    const widget = body(WIDGETS_CSS, '.cg-widget')
    expect(widget).toMatch(/border-block-start: var\(--cg-rule\) solid var\(--cg-line-ink\)/)
    const title = body(WIDGETS_CSS, '.cg-widget__title')
    expect(title).toMatch(/font-size: var\(--cg-text-caption\)/)
    // The host floor sets capitals; this theme's labels are sentence case.
    expect(title).toMatch(/text-transform: none/)
  })

  it('sets every heading in the theme’s one family, never the floor’s serif', () => {
    for (const selector of [
      '.cg-widget__title',
      '.cg-widget__quote-text',
      '.cg-widget__about-heading,\n.cg-widget__cta-heading',
    ]) {
      expect(body(WIDGETS_CSS, selector), selector).toMatch(/font-family: var\(--cg-font\)/)
    }
  })

  it('draws a call to action as an arrow link, never a second filled rectangle', () => {
    const action = body(WIDGETS_CSS, '.cg-widget__cta-action,\n.cg-widget__about-link')
    expect(action).toMatch(/display: inline-block/)
    expect(action).toMatch(/background: none/)
    expect(action).toMatch(/text-decoration-line: underline/)
    expect(WIDGETS_CSS).toContain('.cg-widget__cta-action::after,')
    expect(WIDGETS_CSS).not.toMatch(/\.cg-widget__cta-action[^{]*\{[^}]*background: var/)
  })

  it('shows work at the cover shape the grid uses', () => {
    expect(body(WIDGETS_CSS, '.cg-widget__entry-image')).toMatch(/aspect-ratio: 3 \/ 2/)
  })

  it('never repeats the host floor’s rule above the column on a phone', () => {
    expect(body(WIDGETS_CSS, '.cg-sidebar-layout__aside')).toMatch(/border: 0/)
  })
})
