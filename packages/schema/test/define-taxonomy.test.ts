import { describe, expect, it } from 'vitest'
import { defineCollection } from '../src/define-collection.js'
import { defineTaxonomy, validateTaxonomySet } from '../src/define-taxonomy.js'
import { f } from '../src/fields.js'

/**
 * `defineTaxonomy` checks eagerly, at import time, for the same reason
 * `defineCollection` does: tables, admin screens and the term store are all
 * derived from it, and a mistake caught here costs a restart rather than a
 * database (ADR-0022).
 */

const valid = {
  name: 'category',
  labels: { singular: { fr: 'Catégorie', en: 'Category' } },
  permissions: { read: ['public'], create: ['editor'] },
} as const

describe('defineTaxonomy', () => {
  it('accepts a taxonomy whose labels are indexed by locale', () => {
    const taxonomy = defineTaxonomy(valid)

    expect(taxonomy.name).toBe('category')
    expect(taxonomy.labels.singular.fr).toBe('Catégorie')
  })

  it('refuses a name that could not become a table identifier', () => {
    expect(() => defineTaxonomy({ ...valid, name: 'Ma Catégorie' })).toThrow(/lowercase/)
  })

  it('refuses a label that is a bare string instead of being indexed by locale', () => {
    expect(() =>
      // A taxonomy's labels are per locale, unlike a collection's. Refusing
      // here beats rendering "[object Object]" in the admin much later.
      defineTaxonomy({
        ...valid,
        labels: { singular: 'Catégorie' } as unknown as (typeof valid)['labels'],
      }),
    ).toThrow(/locale/)
  })

  it('refuses a locale key that is not a locale tag', () => {
    expect(() =>
      defineTaxonomy({ ...valid, labels: { singular: { 'not a locale': 'x' } } }),
    ).toThrow(/locale tag/)
  })

  it('refuses `publish` on a term, since a term is never published', () => {
    // The action vocabulary stays frozen (ADR-0022) rather than growing a
    // sixth verb — but granting one that describes no operation is a mistake.
    expect(() =>
      defineTaxonomy({ ...valid, permissions: { ...valid.permissions, publish: ['admin'] } }),
    ).toThrow(/never published/)
  })

  it('refuses an action outside the frozen five', () => {
    expect(() =>
      defineTaxonomy({
        ...valid,
        permissions: { ...valid.permissions, approve: ['admin'] } as never,
      }),
    ).toThrow(/unknown action/)
  })
})

describe('validateTaxonomySet', () => {
  it('refuses two taxonomies sharing a name', () => {
    expect(() => validateTaxonomySet([defineTaxonomy(valid), defineTaxonomy(valid)])).toThrow(
      /share this name/,
    )
  })

  it('refuses a taxonomy field pointing at a taxonomy nobody declares', () => {
    const article = defineCollection({
      name: 'article',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: { title: f.text({ required: true }), topics: f.taxonomy({ of: 'topic' }) },
      permissions: { read: ['public'] },
    })

    expect(() => validateTaxonomySet([defineTaxonomy(valid)], [article])).toThrow(
      /which no taxonomy defines/,
    )
  })

  it('accepts a taxonomy field pointing at a declared taxonomy', () => {
    const article = defineCollection({
      name: 'article',
      labels: { singular: 'Article', plural: 'Articles' },
      fields: { title: f.text({ required: true }), topics: f.taxonomy({ of: 'category' }) },
      permissions: { read: ['public'] },
    })

    expect(() => validateTaxonomySet([defineTaxonomy(valid)], [article])).not.toThrow()
  })
})

describe('f.taxonomy', () => {
  it('is to-many by default, because reuse across entries is the point', () => {
    expect(f.taxonomy({ of: 'category' }).options).toEqual({ of: 'category', many: true })
    expect(f.taxonomy({ of: 'category', many: false }).options.many).toBe(false)
  })

  it('is refused on a collection when it names no taxonomy', () => {
    expect(() =>
      defineCollection({
        name: 'article',
        labels: { singular: 'Article', plural: 'Articles' },
        fields: { topics: { kind: 'taxonomy', options: {} } },
        permissions: { read: ['public'] },
      }),
    ).toThrow(/must name the taxonomy/)
  })
})
