import { describe, expect, it } from 'vitest'
import {
  canPerform,
  grantsForRole,
  knownRoleNames,
  readableCollections,
  taxonomyLabel,
} from '../../src/schema/permissions.js'
import type { CollectionSummary, SchemaDocument, TaxonomySummary } from '../../src/schema/types.js'

const ARTICLE: CollectionSummary = {
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['editor'],
  },
  fields: [],
}

const MEMO: CollectionSummary = {
  name: 'memo',
  labels: { singular: 'Memo', plural: 'Memos' },
  permissions: { read: ['editor'], create: ['editor'], update: ['editor'] },
  fields: [],
}

describe('canPerform', () => {
  it('allows an action open to public, for any actor including anonymous', () => {
    expect(canPerform('read', ARTICLE, [])).toBe(true)
    expect(canPerform('read', ARTICLE, ['viewer'])).toBe(true)
  })

  it('allows an actor holding one of the granted roles', () => {
    expect(canPerform('create', ARTICLE, ['editor'])).toBe(true)
    expect(canPerform('delete', ARTICLE, ['admin'])).toBe(true)
  })

  it('denies an actor holding none of the granted roles', () => {
    expect(canPerform('delete', ARTICLE, ['editor'])).toBe(false)
    expect(canPerform('create', ARTICLE, ['viewer'])).toBe(false)
  })

  it('denies every actor, including admin, for an action the collection never grants to anyone', () => {
    // Unlisted action: an omission grants nobody, not even the most
    // privileged role — the same "deny by default" rule the API enforces.
    expect(canPerform('publish', MEMO, ['admin'])).toBe(false)
  })

  it('is true if the actor holds any one of several roles', () => {
    expect(canPerform('read', MEMO, ['viewer', 'editor'])).toBe(true)
  })

  it('denies a collection closed to public even for an anonymous-shaped role list', () => {
    expect(canPerform('read', MEMO, [])).toBe(false)
  })
})

describe('readableCollections', () => {
  it('keeps only collections the actor may read', () => {
    expect(readableCollections([ARTICLE, MEMO], [])).toEqual([ARTICLE])
    expect(readableCollections([ARTICLE, MEMO], ['editor'])).toEqual([ARTICLE, MEMO])
  })

  it('returns an empty list rather than throwing when nothing is readable', () => {
    const closed: CollectionSummary = {
      name: 'closed',
      labels: { singular: 'Closed', plural: 'Closed' },
      permissions: { read: ['admin'] },
      fields: [],
    }
    expect(readableCollections([closed], ['viewer'])).toEqual([])
  })
})

const CATEGORY: TaxonomySummary = {
  name: 'category',
  labels: { singular: { en: 'Category', fr: 'Catégorie' }, plural: { en: 'Categories' } },
  hierarchical: true,
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
}

const SCHEMA: SchemaDocument = {
  contract: 'schema@2.0',
  collections: [ARTICLE, MEMO],
  taxonomies: [CATEGORY],
}

describe('taxonomyLabel', () => {
  it('prefers the plural label in the requested locale', () => {
    expect(taxonomyLabel(CATEGORY, 'en')).toBe('Categories')
  })

  it('falls back to the singular label when no plural was declared for that locale', () => {
    expect(taxonomyLabel(CATEGORY, 'fr')).toBe('Catégorie')
  })

  it('falls back to any present translation, then to the raw name, rather than throwing', () => {
    const noEnglish: TaxonomySummary = {
      ...CATEGORY,
      labels: { singular: { fr: 'Étiquette' } },
    }
    expect(taxonomyLabel(noEnglish, 'en')).toBe('Étiquette')
    expect(taxonomyLabel({ ...noEnglish, labels: { singular: {} } }, 'en')).toBe('category')
  })
})

describe('knownRoleNames', () => {
  it('collects every role any collection or taxonomy names, deduplicated and sorted', () => {
    expect(knownRoleNames(SCHEMA)).toEqual(['admin', 'editor'])
  })

  it('excludes `public` — a magic marker, never an account role', () => {
    expect(knownRoleNames(SCHEMA)).not.toContain('public')
  })

  it('tolerates a schema with no taxonomies at all', () => {
    expect(knownRoleNames({ collections: [ARTICLE, MEMO] })).toEqual(['admin', 'editor'])
  })
})

describe('grantsForRole', () => {
  it('lists every collection and taxonomy a role gets something on, and exactly what — including a public read it never had to be named for', () => {
    expect(grantsForRole('editor', SCHEMA, 'en')).toEqual([
      {
        subjectKind: 'collection',
        name: 'article',
        label: 'Articles',
        actions: ['read', 'create', 'update', 'publish'],
      },
      {
        subjectKind: 'collection',
        name: 'memo',
        label: 'Memos',
        actions: ['read', 'create', 'update'],
      },
      {
        subjectKind: 'taxonomy',
        name: 'category',
        label: 'Categories',
        actions: ['read', 'create', 'update'],
      },
    ])
  })

  it('a role named nowhere still gets whatever is open to public, and nothing else', () => {
    expect(grantsForRole('translator', SCHEMA, 'en')).toEqual([
      { subjectKind: 'collection', name: 'article', label: 'Articles', actions: ['read'] },
      { subjectKind: 'taxonomy', name: 'category', label: 'Categories', actions: ['read'] },
    ])
  })

  it('returns an empty list for a role that unlocks nothing at all, on a site with no public grants', () => {
    const closed: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [{ ...ARTICLE, permissions: { read: ['admin'] } }],
      taxonomies: [],
    }
    expect(grantsForRole('translator', closed, 'en')).toEqual([])
  })
})
