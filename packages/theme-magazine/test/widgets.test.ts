import type { ChromeInput, WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderChrome } from '../src/render/chrome.js'
import { widgetAreas } from '../src/render/widget-areas.js'

const BASE: ChromeInput = {
  site: { name: 'The Meridian' },
  locale: 'en',
  homeHref: '/',
  headerNav: [],
  footerNav: [{ label: 'About', href: '/about', openInNewTab: false, kind: 'url', title: null }],
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
        title: 'Newsroom',
        devices: { desktop: true, tablet: true, mobile: true },
        items: [{ label: 'Tips', href: '/tips', newTab: false }],
      },
    ],
  },
}

describe('widget areas (theme@1.6)', () => {
  it('declares the areas it names, so the host hands it the footer columns', () => {
    expect(widgetAreas.map((area) => area.id)).toEqual(['sidebar', 'content-after'])
  })

  it('sets the footer columns inside the colophon, under its name and above its own columns', () => {
    const { footer } = renderChrome({ ...BASE, widgets: FOOTER })
    const widgets = footer.indexOf('<div class="cg-footer-widgets cg-colophon__widgets"')
    expect(widgets).toBeGreaterThan(footer.indexOf('cg-colophon__plate'))
    expect(widgets).toBeLessThan(footer.indexOf('cg-colophon__grid'))
    expect(footer).toContain('<h2 class="cg-widget__title">Newsroom</h2>')
  })

  it('renders the colophon exactly as before when no footer widget is given', () => {
    expect(renderChrome(BASE).footer).toBe(renderChrome({ ...BASE, widgets: {} }).footer)
    expect(renderChrome(BASE).footer).not.toContain('cg-colophon__widgets')
  })
})
