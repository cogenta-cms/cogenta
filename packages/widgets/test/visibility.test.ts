import { describe, expect, it } from 'vitest'
import {
  isWidgetVisible,
  validateWidgetVisibility,
  type WidgetRequestContext,
} from '../src/index.js'

const NOW = new Date('2026-09-15T12:00:00.000Z')

const article: WidgetRequestContext = {
  path: '/articles/harbor-line',
  kind: 'entry',
  collection: 'article',
  entryId: 'e1',
  signedIn: false,
  locale: 'en',
  now: NOW,
}

function visible(rules: unknown, context: WidgetRequestContext = article, enabled = true): boolean {
  return isWidgetVisible({ enabled, visibility: validateWidgetVisibility(rules) }, context)
}

describe('widget visibility', () => {
  it('shows everywhere by default, and never when hidden', () => {
    expect(visible({})).toBe(true)
    expect(visible({}, article, false)).toBe(false)
  })

  it('shows only on, or everywhere except, the pages it names', () => {
    const onArticles = {
      pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'article' }] },
    }
    expect(visible(onArticles)).toBe(true)
    expect(visible(onArticles, { ...article, kind: 'home', path: '/' })).toBe(false)
    const notHome = { pages: { mode: 'except', targets: [{ kind: 'home' }] } }
    expect(visible(notHome)).toBe(true)
    expect(visible(notHome, { ...article, kind: 'home', path: '/' })).toBe(false)
  })

  it('narrows to given entries and terms', () => {
    expect(
      visible({
        pages: {
          mode: 'only',
          targets: [{ kind: 'collection', collection: 'article', entryIds: ['e2'] }],
        },
      }),
    ).toBe(false)
    const section: WidgetRequestContext = {
      ...article,
      kind: 'taxonomy',
      taxonomy: 'section',
      termId: 't1',
      path: '/section/news',
    }
    expect(
      visible(
        {
          pages: {
            mode: 'only',
            targets: [{ kind: 'taxonomy', taxonomy: 'section', termIds: ['t1'] }],
          },
        },
        section,
      ),
    ).toBe(true)
  })

  it('matches a path exactly, or a whole branch with /*', () => {
    const guides = { pages: { mode: 'only', targets: [{ kind: 'path', path: '/articles/*' }] } }
    expect(visible(guides)).toBe(true)
    expect(visible(guides, { ...article, path: '/articles' })).toBe(true)
    expect(visible(guides, { ...article, path: '/articlesque' })).toBe(false)
  })

  it('tells visitors and signed-in people apart', () => {
    expect(visible({ audience: 'members' })).toBe(false)
    expect(visible({ audience: 'members' }, { ...article, signedIn: true })).toBe(true)
    expect(visible({ audience: 'visitors' }, { ...article, signedIn: true })).toBe(false)
  })

  it('shows inside its period only, and in its languages only', () => {
    expect(visible({ from: '2026-09-16T00:00:00.000Z' })).toBe(false)
    expect(visible({ until: '2026-09-15T11:00:00.000Z' })).toBe(false)
    expect(visible({ from: '2026-09-01T00:00:00Z', until: '2026-10-01T00:00:00Z' })).toBe(true)
    expect(visible({ locales: ['fr'] })).toBe(false)
  })

  it('refuses a period that ends before it starts', () => {
    expect(() =>
      validateWidgetVisibility({ from: '2026-10-01T00:00:00Z', until: '2026-09-01T00:00:00Z' }),
    ).toThrow(/stop showing before it starts/u)
  })
})
