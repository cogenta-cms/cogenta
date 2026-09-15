import type { WidgetAreas } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { partitionPageAreas, placeWidgetsInMain } from '../src/commands/widget-placement.js'

const DEVICES = { desktop: true, tablet: true, mobile: true }

function area(id: string, text: string): WidgetAreas[string] {
  return {
    id,
    label: id,
    widgets: [
      {
        id: `${id}-1`,
        type: 'quote',
        title: null,
        devices: DEVICES,
        text,
        attribution: '',
        role: '',
      },
    ],
  }
}

const PAGE = '<main class="cg-main" id="cg-main"><h1>Title</h1><p>Body</p></main>'

describe('placeWidgetsInMain', () => {
  it('sets the sidebar beside the content of a reading page, inside <main>', () => {
    const html = placeWidgetsInMain(
      PAGE,
      {
        sidebar: area('sidebar', 'Aside'),
        'content-before': area('content-before', 'Before'),
        'content-after': area('content-after', 'After'),
      },
      { aside: true },
    )
    expect(
      html.startsWith('<main class="cg-main" id="cg-main"><div class="cg-sidebar-layout">'),
    ).toBe(true)
    const content = html.slice(
      html.indexOf('cg-sidebar-layout__content'),
      html.indexOf('<aside class="cg-widget-area cg-sidebar-layout__aside"'),
    )
    expect(content.indexOf('Before')).toBeLessThan(content.indexOf('<h1>Title</h1>'))
    expect(content.indexOf('After')).toBeGreaterThan(content.indexOf('<p>Body</p>'))
    expect(html.endsWith('</aside></div></main>')).toBe(true)
  })

  it('keeps a full-width page untouched and sets the sidebar as a band after it', () => {
    const html = placeWidgetsInMain(PAGE, { sidebar: area('sidebar', 'Aside') }, { aside: false })
    expect(html).not.toContain('cg-sidebar-layout')
    expect(html).toMatch(
      /<p>Body<\/p><aside class="cg-widget-area cg-widget-area--placed" data-area="sidebar"[\s\S]*<\/aside><\/main>$/u,
    )
  })

  it('draws no layout on a reading page whose sidebar is empty', () => {
    const html = placeWidgetsInMain(
      PAGE,
      { 'content-after': area('content-after', 'After') },
      { aside: true },
    )
    expect(html).not.toContain('cg-sidebar-layout')
    expect(html).toContain('After')
  })

  it('leaves the standard areas to the host and a theme its own', () => {
    const { host, theme } = partitionPageAreas({
      sidebar: area('sidebar', 'Aside'),
      'front-rail': area('front-rail', 'Rail'),
    })
    expect(Object.keys(host)).toEqual(['sidebar'])
    expect(Object.keys(theme)).toEqual(['front-rail'])
  })
})
