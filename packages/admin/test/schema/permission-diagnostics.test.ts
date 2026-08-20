import { describe, expect, it } from 'vitest'
import { diagnosePermissions } from '../../src/schema/permission-diagnostics.js'
import type { CollectionSummary, SchemaDocument, TaxonomySummary } from '../../src/schema/types.js'

function collection(overrides: Partial<CollectionSummary>): CollectionSummary {
  return {
    name: 'article',
    labels: { singular: 'Article', plural: 'Articles' },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
    fields: [],
    ...overrides,
  }
}

describe('diagnosePermissions', () => {
  it('flags a collection with no role granted read at all — invisible to everyone, including admin', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({ name: 'ghost', permissions: { create: ['editor'] } })],
    }
    const anomalies = diagnosePermissions(schema, {}, 'en')
    expect(anomalies).toContainEqual(
      expect.objectContaining({ kind: 'unreadable', severity: 'high', subject: 'ghost' }),
    )
  })

  it('flags a collection open to public for a write action — a strong warning', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [
        collection({
          name: 'comment',
          permissions: { read: ['public'], create: ['public'], delete: ['public'] },
        }),
      ],
    }
    const anomalies = diagnosePermissions(schema, {}, 'en')
    const found = anomalies.find((a) => a.kind === 'publicWrite' && a.subject === 'comment')
    expect(found).toBeDefined()
    expect(found?.severity).toBe('high')
    expect(found?.actions).toEqual(['create', 'delete'])
  })

  it('never reports publicWrite for a collection with no write action open to public', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({ permissions: { read: ['public'], create: ['editor'] } })],
    }
    expect(diagnosePermissions(schema, {}, 'en').some((a) => a.kind === 'publicWrite')).toBe(false)
  })

  it('flags a role held by an account but named by no collection or taxonomy — the typo case', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({})],
    }
    const anomalies = diagnosePermissions(schema, { editeur: 2 }, 'en')
    expect(anomalies).toContainEqual(
      expect.objectContaining({
        kind: 'unknownRoleInUse',
        severity: 'medium',
        subject: 'editeur',
        accountCount: 2,
      }),
    )
  })

  it('never flags a role the schema actually declares, even if it is also held by accounts', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({})],
    }
    const anomalies = diagnosePermissions(schema, { editor: 3 }, 'en')
    expect(anomalies.some((a) => a.kind === 'unknownRoleInUse')).toBe(false)
  })

  it('never treats `public` itself as an unknown or unused role', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({})],
    }
    const anomalies = diagnosePermissions(schema, { public: 999 }, 'en')
    expect(anomalies.some((a) => a.subject === 'public')).toBe(false)
  })

  it('flags a role the schema declares but that no account on this site holds', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({})],
    }
    const anomalies = diagnosePermissions(schema, {}, 'en')
    expect(anomalies).toContainEqual(
      expect.objectContaining({ kind: 'unusedRole', severity: 'low', subject: 'editor' }),
    )
  })

  it('never flags a declared role that at least one account actually holds', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({})],
    }
    const anomalies = diagnosePermissions(schema, { editor: 1 }, 'en')
    expect(anomalies.some((a) => a.kind === 'unusedRole')).toBe(false)
  })

  it('catches the exact shape of the L10 sitemap bug: a routed collection closed to public reads', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [
        collection({
          name: 'article',
          permissions: { read: ['editor'] },
          routing: { pattern: '/articles/:slug' },
        }),
      ],
    }
    const anomalies = diagnosePermissions(schema, {}, 'en')
    expect(anomalies).toContainEqual(
      expect.objectContaining({ kind: 'routedNotPublic', severity: 'medium', subject: 'article' }),
    )
  })

  it('does not also raise routedNotPublic when the collection is already flagged unreadable', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [
        collection({
          name: 'article',
          permissions: {},
          routing: { pattern: '/articles/:slug' },
        }),
      ],
    }
    const anomalies = diagnosePermissions(schema, {}, 'en')
    expect(anomalies.filter((a) => a.subject === 'article')).toEqual([
      expect.objectContaining({ kind: 'unreadable' }),
    ])
  })

  it('never flags a routed collection that is readable by public', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [
        collection({
          name: 'article',
          permissions: { read: ['public'] },
          routing: { pattern: '/articles/:slug' },
        }),
      ],
    }
    expect(diagnosePermissions(schema, {}, 'en').some((a) => a.kind === 'routedNotPublic')).toBe(
      false,
    )
  })

  it('never flags an unrouted collection for routedNotPublic, however closed its reads are', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [collection({ name: 'internal', permissions: { read: ['admin'] } })],
    }
    expect(diagnosePermissions(schema, {}, 'en').some((a) => a.kind === 'routedNotPublic')).toBe(
      false,
    )
  })

  it('runs the same four checks over taxonomies as over collections, using the taxonomy label', () => {
    const category: TaxonomySummary = {
      name: 'category',
      labels: { singular: { en: 'Category' } },
      hierarchical: true,
      permissions: { read: [], create: ['public'] },
    }
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [],
      taxonomies: [category],
    }
    const anomalies = diagnosePermissions(schema, {}, 'en')
    expect(anomalies).toContainEqual(
      expect.objectContaining({ kind: 'unreadable', subjectKind: 'taxonomy', label: 'Category' }),
    )
    expect(anomalies).toContainEqual(
      expect.objectContaining({
        kind: 'publicWrite',
        subjectKind: 'taxonomy',
        actions: ['create'],
      }),
    )
  })

  it('returns nothing at all for a clean, fully-consistent schema', () => {
    const schema: SchemaDocument = {
      contract: 'schema@2.0',
      collections: [
        collection({
          name: 'article',
          permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
          routing: { pattern: '/articles/:slug' },
        }),
      ],
    }
    expect(diagnosePermissions(schema, { editor: 1 }, 'en')).toEqual([])
  })
})
