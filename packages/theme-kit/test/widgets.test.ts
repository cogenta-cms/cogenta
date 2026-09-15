import { describe, expect, it } from 'vitest'
import {
  type ResolvedWidget,
  type ResolvedWidgetArea,
  renderFooterWidgets,
  renderWidgetArea,
  serialize,
} from '../src/index.js'

const all = { desktop: true, tablet: true, mobile: true }

function area(widgets: readonly ResolvedWidget[], id = 'sidebar'): ResolvedWidgetArea {
  return { id, label: 'Sidebar', widgets }
}

function html(widgets: readonly ResolvedWidget[]): string {
  const node = renderWidgetArea(area(widgets))
  return node === null ? '' : serialize(node)
}

describe('renderWidgetArea', () => {
  it('renders nothing for an area with nothing to show on this page', () => {
    expect(renderWidgetArea(undefined)).toBeNull()
    expect(renderWidgetArea(area([]))).toBeNull()
  })

  it('draws each widget as a titled section inside a labelled aside', () => {
    const out = html([
      {
        id: 'w1',
        title: 'Search',
        devices: all,
        type: 'search',
        action: '/search',
        label: 'Search the site',
        placeholder: 'Search',
        button: 'Go',
      },
    ])
    expect(out).toContain('<aside class="cg-widget-area" data-area="sidebar" aria-label="Sidebar">')
    expect(out).toContain('<section class="cg-widget cg-widget--search" data-widget-id="w1">')
    expect(out).toContain('<h2 class="cg-widget__title">Search</h2>')
    expect(out).toContain('action="/search"')
    expect(out).toContain(
      '<label class="cg-visually-hidden" for="cg-widget-w1-q">Search the site</label>',
    )
  })

  it('marks the screens a widget is hidden on, for the stylesheet to act on', () => {
    const out = html([
      {
        id: 'w2',
        title: null,
        devices: { desktop: true, tablet: false, mobile: false },
        type: 'quote',
        text: 'Hello',
        attribution: '',
        role: '',
      },
    ])
    expect(out).toContain('data-hide-tablet="true"')
    expect(out).toContain('data-hide-mobile="true"')
    expect(out).not.toContain('data-hide-desktop')
    expect(out).not.toContain('cg-widget__title')
  })

  it('escapes every string a widget carries', () => {
    const out = html([
      {
        id: 'w3',
        title: '<script>',
        devices: all,
        type: 'cta',
        heading: '"quoted" & <b>',
        body: '',
        action: { label: 'Go', href: '/x', newTab: true },
      },
    ])
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('target="_blank" rel="noopener noreferrer"')
  })

  it('lists entries with dates and says so when there are none', () => {
    const out = html([
      {
        id: 'w4',
        title: 'Latest',
        devices: all,
        type: 'entries',
        variant: 'recent',
        empty: 'Nothing yet.',
        items: [
          {
            title: 'A story',
            href: '/a',
            date: 'Sep 1, 2026',
            datetime: '2026-09-01T00:00:00Z',
            excerpt: null,
            image: null,
          },
        ],
      },
      {
        id: 'w5',
        title: 'Related',
        devices: all,
        type: 'entries',
        variant: 'related',
        empty: 'Nothing yet.',
        items: [],
      },
    ])
    expect(out).toContain('<a class="cg-widget__entry-title" href="/a">A story</a>')
    expect(out).toContain(
      '<time class="cg-widget__entry-date" datetime="2026-09-01T00:00:00Z">Sep 1, 2026</time>',
    )
    expect(out).toContain('<p class="cg-widget__empty">Nothing yet.</p>')
  })

  it('offers a term dropdown that works without script', () => {
    const out = html([
      {
        id: 'w6',
        title: 'Sections',
        devices: all,
        type: 'terms',
        display: 'dropdown',
        prompt: 'Choose a section',
        items: [
          { label: 'News', href: '/section/news', count: 4, depth: 0, current: true },
          { label: 'City', href: '/section/city', count: 2, depth: 1, current: false },
        ],
      },
    ])
    expect(out).toContain('<form class="cg-widget__jump" method="get" action="/_cogenta/go">')
    expect(out).toContain('<option value="/section/news" selected>News (4)</option>')
  })

  it('links to a form page when the form cannot live in a widget', () => {
    const out = html([
      {
        id: 'w7',
        title: null,
        devices: all,
        type: 'form',
        link: { label: 'Apply', href: '/forms/apply', newTab: false },
        action: '',
        fields: [],
        hidden: {},
        honeypot: '_gotcha',
        submit: 'Send',
      },
    ])
    expect(out).toContain('<a class="cg-widget__form-link" href="/forms/apply">Apply</a>')
    expect(out).not.toContain('<form')
  })
})

describe('renderFooterWidgets', () => {
  it('sets only the columns that have something, in order', () => {
    const quote = (id: string): ResolvedWidget => ({
      id,
      title: null,
      devices: all,
      type: 'quote',
      text: id,
      attribution: '',
      role: '',
    })
    const node = renderFooterWidgets({
      'footer-3': area([quote('c')], 'footer-3'),
      'footer-1': area([quote('a')], 'footer-1'),
      'footer-2': area([], 'footer-2'),
    })
    const out = node === null ? '' : serialize(node)
    expect(out).toContain('data-columns="2"')
    expect(out.indexOf('data-area="footer-1"')).toBeLessThan(out.indexOf('data-area="footer-3"'))
    expect(renderFooterWidgets({})).toBeNull()
  })
})
