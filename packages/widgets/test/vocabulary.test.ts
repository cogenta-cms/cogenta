import { describe, expect, it } from 'vitest'
import {
  DYNAMIC_WIDGET_TYPES,
  STANDARD_WIDGET_AREAS,
  validateWidgetSettings,
  WIDGET_TYPES,
  widgetAreasFor,
} from '../src/index.js'

describe('the widget vocabulary', () => {
  it('fills in defaults, so a stored widget always has every setting it renders with', () => {
    expect(validateWidgetSettings('recentEntries', { collection: 'article' })).toEqual({
      collection: 'article',
      count: 5,
      showDate: true,
      showExcerpt: false,
      showImage: false,
    })
    expect(validateWidgetSettings('search', undefined)).toEqual({ placeholder: '' })
  })

  it('refuses an unknown type, an unknown setting and a bad value, naming what is wrong', () => {
    expect(() => validateWidgetSettings('customHtml', {})).toThrow(/not a widget type/u)
    expect(() => validateWidgetSettings('search', { placeholder: 'x', html: '<b>' })).toThrow(
      /not valid/u,
    )
    expect(() => validateWidgetSettings('recentEntries', { collection: 'a', count: 500 })).toThrow(
      /at "count"/u,
    )
  })

  it('never accepts a javascript: link', () => {
    expect(() =>
      validateWidgetSettings('links', { items: [{ label: 'x', href: 'javascript:alert(1)' }] }),
    ).toThrow(/WIDGET|not valid/u)
  })

  it('needs both halves of a term filter', () => {
    expect(() =>
      validateWidgetSettings('recentEntries', { collection: 'article', taxonomy: 'section' }),
    ).toThrow(/both a taxonomy and a term/u)
  })

  it('has no widget that stores markup (R3)', () => {
    expect(WIDGET_TYPES).not.toContain('html')
    expect(WIDGET_TYPES).not.toContain('customHtml')
    expect(WIDGET_TYPES.length).toBeGreaterThanOrEqual(20)
    for (const type of DYNAMIC_WIDGET_TYPES) expect(WIDGET_TYPES).toContain(type)
  })
})

describe('widget areas', () => {
  it('offers the standard areas to a theme that declares none', () => {
    expect(widgetAreasFor(undefined).map((area) => area.id)).toEqual(
      STANDARD_WIDGET_AREAS.map((area) => area.id),
    )
  })

  it('lets a theme rename a standard area and add its own, and ignores a malformed key', () => {
    const areas = widgetAreasFor([
      { id: 'sidebar', label: 'Article rail' },
      { id: 'masthead', label: 'Under the masthead' },
      { id: 'Bad Key', label: 'Nope' },
    ])
    expect(areas.find((area) => area.id === 'sidebar')?.label).toBe('Article rail')
    expect(areas.at(-1)?.id).toBe('masthead')
    expect(areas.some((area) => area.id === 'Bad Key')).toBe(false)
  })
})
