import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { defineCollection, validateCollectionSet } from '../src/define-collection.js'
import { f } from '../src/fields.js'
import type { CollectionDefinition } from '../src/types.js'

/** The example of contract A, verbatim enough to be worth testing. */
const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({ required: true, max: 200, localized: true }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 320, localized: true }),
    body: f.richText({ localized: true }),
    cover: f.media({ accept: ['image'], required: true }),
    author: f.relation({ to: 'author', required: true, onDelete: 'restrict' }),
    tags: f.relation({ to: 'tag', many: true }),
    publishedAt: f.datetime(),
    blocks: f.blocks({ allow: '*' }),
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

/** Builds a collection around one questionable piece, keeping the rest valid. */
function collection(overrides: Partial<CollectionDefinition>): CollectionDefinition {
  return {
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    fields: { title: f.text({ required: true }) },
    permissions: { read: ['public'] },
    ...overrides,
  }
}

/** Runs `defineCollection` and returns the error it threw, or fails loudly. */
function rejectionOf(definition: CollectionDefinition): CogentaError {
  try {
    defineCollection(definition)
  } catch (error) {
    expect(error).toBeInstanceOf(CogentaError)
    return error as CogentaError
  }
  throw new Error('the definition was accepted, but the test expected a refusal')
}

describe('defineCollection — a valid definition', () => {
  it('returns the definition it was given, untouched', () => {
    expect(article.name).toBe('article')
    expect(Object.keys(article.fields)).toHaveLength(9)
  })

  it('accepts an index on a system field, which every collection has', () => {
    expect(() => defineCollection(collection({ indexes: [['updatedAt', 'desc']] }))).not.toThrow()
  })
})

describe('defineCollection — refusals name the offending field', () => {
  it('refuses a field that was not built with an f constructor', () => {
    const error = rejectionOf(
      collection({ fields: { title: { kind: 'nope', options: {} } as never } }),
    )

    expect(error.code).toBe('SCHEMA_INVALID')
    expect(error.message).toContain('fields.title')
    expect(error.message).toContain('`f.*`')
  })

  it('refuses a collection that redeclares a system field', () => {
    const error = rejectionOf(collection({ fields: { status: f.text() } }))

    expect(error.message).toContain('fields.status')
    expect(error.message).toContain('system field')
  })

  it('refuses a relation that does not say where it points', () => {
    const error = rejectionOf(collection({ fields: { author: f.relation({ to: '' }) } }))

    expect(error.message).toContain('fields.author.to')
  })

  it('refuses setNull on a required relation, which may never be null', () => {
    const error = rejectionOf(
      collection({
        fields: { author: f.relation({ to: 'author', required: true, onDelete: 'setNull' }) },
      }),
    )

    expect(error.message).toContain('fields.author.onDelete')
  })

  it('refuses setNull on a to-many relation, where it means nothing', () => {
    const error = rejectionOf(
      collection({ fields: { tags: f.relation({ to: 'tag', many: true, onDelete: 'setNull' }) } }),
    )

    expect(error.message).toContain('fields.tags.onDelete')
  })

  it('refuses a select with no options at all', () => {
    const error = rejectionOf(collection({ fields: { size: f.select({ options: [] }) } }))

    expect(error.message).toContain('fields.size.options')
  })

  it('refuses two select options sharing a value', () => {
    const error = rejectionOf(collection({ fields: { size: f.select({ options: ['s', 's'] }) } }))

    expect(error.message).toContain('duplicate option value "s"')
  })

  it('refuses a slug derived from a field the collection does not declare', () => {
    const error = rejectionOf(collection({ fields: { slug: f.slug({ from: 'headline' }) } }))

    expect(error.message).toContain('fields.slug.from')
    expect(error.message).toContain('headline')
  })

  it('refuses an unknown kind of media', () => {
    const error = rejectionOf(
      collection({ fields: { cover: f.media({ accept: ['hologram' as never] }) } }),
    )

    expect(error.message).toContain('fields.cover.accept')
  })

  it('refuses an empty list of allowed blocks, which would allow nothing', () => {
    const error = rejectionOf(collection({ fields: { zone: f.blocks({ allow: [] }) } }))

    expect(error.message).toContain('fields.zone.allow')
  })

  it('refuses a default value the field itself would reject', () => {
    const error = rejectionOf(collection({ fields: { size: f.number({ min: 10, default: 2 }) } }))

    expect(error.message).toContain('fields.size.default')
  })

  it('refuses a display condition on a field that does not exist', () => {
    const error = rejectionOf(
      collection({
        fields: {
          title: f.text({ required: true }),
          subtitle: f.text({ admin: { showWhen: { field: 'kicker', equals: true } } }),
        },
      }),
    )

    expect(error.message).toContain('fields.subtitle.admin.showWhen.field')
  })

  it('lists every problem at once rather than one per run', () => {
    const error = rejectionOf(
      collection({
        fields: { a: f.select({ options: [] }), b: f.relation({ to: '' }) },
      }),
    )

    expect(error.message).toContain('fields.a.options')
    expect(error.message).toContain('fields.b.to')
  })

  it('carries the collection and its issues in the error details, for logs', () => {
    const error = rejectionOf(collection({ fields: { size: f.select({ options: [] }) } }))

    expect(error.details).toMatchObject({
      collection: 'page',
      issues: [{ path: 'fields.size.options' }],
    })
    expect(error.hint).toContain('cogenta generate')
  })
})

describe('defineCollection — the definition around the fields', () => {
  it('refuses a name that cannot become a table identifier', () => {
    expect(rejectionOf(collection({ name: 'Blog Post' })).message).toContain('name')
  })

  it('refuses a collection with no field', () => {
    expect(rejectionOf(collection({ fields: {} })).message).toContain('fields')
  })

  it('refuses a missing plural label, which the admin needs to name a list', () => {
    const error = rejectionOf(collection({ labels: { singular: 'Page', plural: '' } }))

    expect(error.message).toContain('labels.plural')
  })

  it('refuses a route parameter that matches no field', () => {
    const error = rejectionOf(collection({ routing: { pattern: '/pages/:handle' } }))

    expect(error.message).toContain('routing.pattern')
    expect(error.message).toContain(':handle')
  })

  it('accepts :locale in a route, which every entry carries', () => {
    expect(() =>
      defineCollection(collection({ routing: { pattern: '/:locale/pages/:title' } })),
    ).not.toThrow()
  })

  it('refuses a route that is not absolute', () => {
    expect(rejectionOf(collection({ routing: { pattern: 'pages/:title' } })).message).toContain(
      'routing.pattern',
    )
  })

  it('refuses an index on a field nobody declared', () => {
    expect(rejectionOf(collection({ indexes: [['headline']] })).message).toContain('indexes[0]')
  })

  it('refuses an action outside the five of the contract', () => {
    const error = rejectionOf(
      collection({ permissions: { read: ['public'], archive: ['admin'] } as never }),
    )

    expect(error.message).toContain('permissions.archive')
    expect(error.message).toContain('read, create, update, delete, publish')
  })

  it('accepts any role name, because roles are an open set', () => {
    expect(() =>
      defineCollection(collection({ permissions: { read: ['public', 'legal_reviewer'] } })),
    ).not.toThrow()
  })

  it('refuses keeping a fractional number of versions', () => {
    expect(rejectionOf(collection({ versioning: { keep: 2.5 } })).message).toContain(
      'versioning.keep',
    )
  })

  it('accepts the object form { roles, own } on update and delete (schema@2.1, ADR-0027)', () => {
    expect(() =>
      defineCollection(
        collection({
          permissions: {
            read: ['public'],
            update: { roles: ['author'], own: true },
            delete: { roles: ['author'], own: true },
          },
        }),
      ),
    ).not.toThrow()
  })

  it("refuses own: true on 'create', which has no owner yet to compare against", () => {
    const error = rejectionOf(
      collection({ permissions: { read: ['public'], create: { roles: ['author'], own: true } } }),
    )

    expect(error.message).toContain('permissions.create.own')
    expect(error.message).toContain('create')
  })

  it.each(['read', 'publish'] as const)(
    "refuses own: true on '%s', which the runtime does not resolve an owner for yet",
    (action) => {
      const error = rejectionOf(
        collection({
          permissions: { read: ['public'], [action]: { roles: ['author'], own: true } },
        }),
      )

      expect(error.message).toContain(`permissions.${action}.own`)
      expect(error.message).toContain('not yet supported')
    },
  )

  it('refuses a non-boolean own', () => {
    const error = rejectionOf(
      collection({
        permissions: { read: ['public'], update: { roles: ['author'], own: 'yes' } as never },
      }),
    )

    expect(error.message).toContain('permissions.update.own')
  })
})

describe('validateCollectionSet', () => {
  it('accepts a set where every relation finds its target', () => {
    const author = defineCollection({
      name: 'author',
      labels: { singular: 'Author', plural: 'Authors' },
      fields: { name: f.text({ required: true }) },
      permissions: { read: ['public'] },
    })
    const tag = defineCollection({
      name: 'tag',
      labels: { singular: 'Tag', plural: 'Tags' },
      fields: { name: f.text({ required: true }) },
      permissions: { read: ['public'] },
    })

    expect(() => validateCollectionSet([article, author, tag])).not.toThrow()
  })

  it('refuses a relation pointing at a collection that does not exist', () => {
    try {
      validateCollectionSet([article])
      throw new Error('the set was accepted, but the test expected a refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).message).toContain('fields.author.to')
    }
  })

  it('refuses two collections sharing a name', () => {
    const first = collection({})
    expect(() => validateCollectionSet([first, first])).toThrow(CogentaError)
  })
})
