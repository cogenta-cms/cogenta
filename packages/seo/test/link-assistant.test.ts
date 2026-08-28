import { describe, expect, it } from 'vitest'
import { analyseInternalLinks } from '../src/link-assistant.js'
import { makeArticle, makePage } from './fixtures.js'

/** A resource whose `values` carries a `{ collection, id }` reference anywhere — the exact structural shape `extractLinks` (`@cogenta/schema`) recognises regardless of which field it sits in. */
function linkedArticle(
  id: string,
  title: string,
  linksTo?: { readonly collection: string; readonly id: string },
): ReturnType<typeof makeArticle> {
  return makeArticle({
    id,
    values: {
      title,
      slug: title.toLowerCase().replace(/\s+/gu, '-'),
      ...(linksTo === undefined ? {} : { relatedEntry: linksTo }),
    },
  })
}

describe('analyseInternalLinks — orphans', () => {
  it('reports every entry as orphaned when nothing links to anything', () => {
    const report = analyseInternalLinks([
      linkedArticle('a', 'First article'),
      linkedArticle('b', 'Second article'),
    ])

    expect(report.orphans.map((o) => o.id).sort()).toEqual(['a', 'b'])
  })

  it('removes an entry from the orphan list once another entry links to it', () => {
    const report = analyseInternalLinks([
      linkedArticle('a', 'First article'),
      linkedArticle('b', 'Second article', { collection: 'article', id: 'a' }),
    ])

    expect(report.orphans.map((o) => o.id)).toEqual(['b'])
  })

  it('does not let a self-link un-orphan an entry', () => {
    const report = analyseInternalLinks([
      linkedArticle('a', 'First article', { collection: 'article', id: 'a' }),
    ])

    expect(report.orphans.map((o) => o.id)).toEqual(['a'])
  })

  it('counts a link from a different collection towards orphan status', () => {
    const article = linkedArticle('a', 'First article')
    const page = makePage({
      id: 'p1',
      values: { title: 'About', slug: 'about', linkToArticle: { collection: 'article', id: 'a' } },
    })

    const report = analyseInternalLinks([article, page])

    expect(report.orphans.map((o) => o.id)).toEqual(['p1'])
  })

  it('ignores a link pointing at an entry outside the scanned set', () => {
    const report = analyseInternalLinks([
      linkedArticle('a', 'First article', { collection: 'article', id: 'does-not-exist' }),
    ])

    expect(report.orphans.map((o) => o.id)).toEqual(['a'])
  })
})

describe('analyseInternalLinks — suggestions', () => {
  it('suggests a sibling from the same collection sharing title words', () => {
    const subject = linkedArticle('a', 'Guide de voyage en Italie')
    const sibling = linkedArticle('b', 'Guide de voyage en Espagne')
    const unrelated = linkedArticle('c', 'Recette de cuisine')

    const report = analyseInternalLinks([subject, sibling, unrelated])

    const suggestions = report.suggestionsByEntry.get('article/a')
    expect(suggestions?.map((s) => s.id)).toEqual(['b'])
    expect(suggestions?.[0]?.sharedWordCount).toBeGreaterThan(0)
  })

  it('never suggests an entry from a different collection', () => {
    const subject = linkedArticle('a', 'Guide de voyage complet')
    const pageWithSameWords = makePage({
      id: 'p1',
      values: { title: 'Guide de voyage complet', slug: 'guide' },
    })

    const report = analyseInternalLinks([subject, pageWithSameWords])

    expect(report.suggestionsByEntry.get('article/a')).toBeUndefined()
  })

  it('caps suggestions at five, ranked by shared word count', () => {
    const subject = linkedArticle('subject', 'Guide de voyage en Italie')
    const siblings = Array.from({ length: 7 }, (_, index) =>
      linkedArticle(`sibling-${index}`, `Guide de voyage numero ${index}`),
    )

    const report = analyseInternalLinks([subject, ...siblings])
    const suggestions = report.suggestionsByEntry.get('article/subject')

    expect(suggestions).toHaveLength(5)
  })

  it('reports no suggestion entry at all when nothing shares a title word', () => {
    const subject = linkedArticle('a', 'Zzyx Qwerty')
    const other = linkedArticle('b', 'Completely different words')

    const report = analyseInternalLinks([subject, other])

    expect(report.suggestionsByEntry.has('article/a')).toBe(false)
  })
})
