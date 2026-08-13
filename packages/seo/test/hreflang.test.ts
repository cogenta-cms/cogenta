import { describe, expect, it } from 'vitest'
import { alternatesFor, buildHreflangMap, groupTranslationFamilies } from '../src/hreflang.js'
import { makeArticle, site } from './fixtures.js'

function family(): ReturnType<typeof makeArticle>[] {
  return [
    makeArticle({ id: 'src', locale: 'en', values: { slug: 'hello' } }),
    makeArticle({ id: 't-fr', locale: 'fr', translationOf: 'src', values: { slug: 'bonjour' } }),
    makeArticle({ id: 't-de', locale: 'de', translationOf: 'src', values: { slug: 'hallo' } }),
  ]
}

describe('translation families', () => {
  it('groups an entry with its translations through translationOf', () => {
    const families = groupTranslationFamilies(site, family())

    expect(families).toHaveLength(1)
    expect(families[0]?.sourceId).toBe('src')
    expect(families[0]?.members.map((member) => member.entry.locale)).toEqual(['de', 'en', 'fr'])
  })

  it('keeps two unrelated entries in two families', () => {
    const resources = [
      ...family(),
      makeArticle({ id: 'other', locale: 'en', values: { slug: 'other' } }),
    ]

    expect(groupTranslationFamilies(site, resources)).toHaveLength(2)
  })
})

describe('hreflang alternates', () => {
  it('names one URL per language of the family', () => {
    const [group] = groupTranslationFamilies(site, family())
    const alternates = alternatesFor(site, group ?? { sourceId: '', members: [] })

    expect(alternates).toEqual([
      { hreflang: 'de', href: 'https://example.com/de/blog/hallo' },
      { hreflang: 'en', href: 'https://example.com/en/blog/hello' },
      { hreflang: 'fr', href: 'https://example.com/fr/blog/bonjour' },
      { hreflang: 'x-default', href: 'https://example.com/en/blog/hello' },
    ])
  })

  it('points x-default at the source entry, the one with no translationOf', () => {
    const [group] = groupTranslationFamilies(site, family())
    const alternates = alternatesFor(site, group ?? { sourceId: '', members: [] })
    const xDefault = alternates.find((one) => one.hreflang === 'x-default')

    expect(xDefault?.href).toBe('https://example.com/en/blog/hello')
  })

  it('emits no x-default at all when the source is unpublished, rather than guessing one', () => {
    const members = family()
    const withDraftSource = [
      makeArticle({ id: 'src', locale: 'en', status: 'draft', values: { slug: 'hello' } }),
      ...members.slice(1),
    ]

    const [group] = groupTranslationFamilies(site, withDraftSource)
    const alternates = alternatesFor(site, group ?? { sourceId: '', members: [] })

    expect(alternates.map((one) => one.hreflang)).toEqual(['de', 'fr'])
  })
})

describe('hreflang reciprocity', () => {
  it('gives every page of a family the identical alternate set', () => {
    const map = buildHreflangMap(site, family())

    const sets = [...map.values()].map((alternates) => JSON.stringify(alternates))
    expect(new Set(sets).size).toBe(1)
    expect(map.size).toBe(3)
  })

  it('is reciprocal: if one page names another, the other names it back', () => {
    const resources = family()
    const map = buildHreflangMap(site, resources)

    const urlOf = new Map(
      resources.map((resource) => [
        resource.entry.id,
        `https://example.com/${resource.entry.locale}/blog/${String(resource.entry.values.slug)}`,
      ]),
    )

    for (const from of resources) {
      const alternates = map.get(from.entry.id) ?? []
      for (const to of resources) {
        if (from.entry.id === to.entry.id) continue
        const target = urlOf.get(to.entry.id) as string

        // Forward: `from` names `to`.
        expect(alternates.some((one) => one.href === target)).toBe(true)

        // Backward: `to` names `from`. Google drops the whole cluster otherwise.
        const back = map.get(to.entry.id) ?? []
        expect(back.some((one) => one.href === (urlOf.get(from.entry.id) as string))).toBe(true)
      }
    }
  })

  it('makes every page name itself, which the annotation requires', () => {
    const resources = family()
    const map = buildHreflangMap(site, resources)

    for (const resource of resources) {
      const alternates = map.get(resource.entry.id) ?? []
      expect(alternates.some((one) => one.hreflang === resource.entry.locale)).toBe(true)
    }
  })

  it('never advertises an unpublished translation, whose URL would 404', () => {
    const resources = [
      makeArticle({ id: 'src', locale: 'en', values: { slug: 'hello' } }),
      makeArticle({ id: 't-fr', locale: 'fr', translationOf: 'src', values: { slug: 'bonjour' } }),
      makeArticle({
        id: 't-de',
        locale: 'de',
        translationOf: 'src',
        status: 'draft',
        values: { slug: 'hallo' },
      }),
    ]

    const map = buildHreflangMap(site, resources)

    expect(map.has('t-de')).toBe(false)
    for (const alternates of map.values()) {
      expect(alternates.map((one) => one.hreflang)).toEqual(['en', 'fr', 'x-default'])
    }
  })

  it('stays reciprocal after a draft translation is removed from the family', () => {
    const resources = [
      makeArticle({ id: 'src', locale: 'en', values: { slug: 'hello' } }),
      makeArticle({ id: 't-fr', locale: 'fr', translationOf: 'src', values: { slug: 'bonjour' } }),
      makeArticle({
        id: 't-de',
        locale: 'de',
        translationOf: 'src',
        state: 'working',
        values: { slug: 'hallo' },
      }),
    ]

    const map = buildHreflangMap(site, resources)
    const en = map.get('src') ?? []
    const fr = map.get('t-fr') ?? []

    expect(JSON.stringify(en)).toBe(JSON.stringify(fr))
    expect(en.some((one) => one.hreflang === 'de')).toBe(false)
  })

  it('annotates nothing for an entry that has no translation', () => {
    const map = buildHreflangMap(site, [makeArticle({ id: 'lonely', values: { slug: 'lonely' } })])

    expect(map.size).toBe(0)
  })
})
