import { describe, expect, it } from 'vitest'
import { defineCollection } from '../src/define-collection.js'
import { f } from '../src/fields.js'
import {
  buildSchemaDocument,
  renderSchemaJson,
  SCHEMA_DOCUMENT_CONTRACT,
  type SchemaDocumentField,
} from '../src/generate-schema-json.js'
import { SYSTEM_FIELD_NAMES } from '../src/system-fields.js'

const author = defineCollection({
  name: 'author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: { name: f.text({ required: true }) },
  permissions: { read: ['public'] },
})

const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true, keep: 20 },
  fields: {
    title: f.text({
      required: true,
      max: 200,
      localized: true,
      admin: { label: 'Title', help: 'Shown in listings', group: 'Content' },
    }),
    slug: f.slug({ from: 'title', unique: true }),
    author: f.relation({ to: 'author', required: true }),
    audience: f.select({ options: ['everyone', { value: 'members', label: 'Members' }] }),
    publishedAt: f.datetime(),
    tone: f.text({ default: 'neutral' }),
    zone: f.blocks({ allow: ['hero'] }),
    secret: f.text({
      validate: (value) => (String(value).length > 3 ? true : 'too short'),
      admin: { showWhen: { field: 'audience', equals: 'members' } },
    }),
  },
  indexes: [['publishedAt', 'desc']],
  permissions: { read: ['public'], create: ['editor'], publish: ['admin'] },
})

const document = buildSchemaDocument([article, author])

function fieldNamed(name: string): SchemaDocumentField {
  const collection = document.collections.find((entry) => entry.name === 'article')
  const field = collection?.fields.find((entry) => entry.name === name)
  if (field === undefined) throw new Error(`the document has no field "${name}"`)
  return field
}

describe('buildSchemaDocument', () => {
  it('states which version of the contract it describes', () => {
    expect(document.contract).toBe(SCHEMA_DOCUMENT_CONTRACT)
    expect(SCHEMA_DOCUMENT_CONTRACT).toBe('schema@1.0')
  })

  it('describes the system fields once, not once per collection', () => {
    expect(document.systemFields.map((descriptor) => descriptor.name)).toEqual([
      ...SYSTEM_FIELD_NAMES,
    ])
    expect(document.collections.every((entry) => entry.fields.length < SYSTEM_FIELD_NAMES.length))
  })

  it('marks every system field read-only, since the runtime owns them', () => {
    expect(document.systemFields.every((descriptor) => descriptor.readOnly)).toBe(true)
  })

  it('lists the values of the enumerated system fields, so the admin can render a filter', () => {
    const status = document.systemFields.find((descriptor) => descriptor.name === 'status')
    const provenance = document.systemFields.find((descriptor) => descriptor.name === 'provenance')

    expect(status?.values).toEqual(['draft', 'scheduled', 'published', 'archived'])
    expect(provenance?.values).toEqual(['human', 'assisted', 'generated'])
  })

  it('sorts collections by name, so a reordered import produces no diff', () => {
    expect(buildSchemaDocument([author, article]).collections.map((entry) => entry.name)).toEqual([
      'article',
      'author',
    ])
  })

  it('keeps the fields of a collection in the order they were declared', () => {
    expect(document.collections[0]?.fields.map((field) => field.name)).toEqual([
      'title',
      'slug',
      'author',
      'audience',
      'publishedAt',
      'tone',
      'zone',
      'secret',
    ])
  })

  it('carries routing, versioning, indexes and permissions to the admin', () => {
    const collection = document.collections[0]

    expect(collection?.routing).toEqual({ pattern: '/blog/:slug', locale: true })
    expect(collection?.versioning).toEqual({ drafts: true, history: true, keep: 20 })
    expect(collection?.indexes).toEqual([['publishedAt', 'desc']])
    expect(collection?.permissions).toEqual({
      read: ['public'],
      create: ['editor'],
      publish: ['admin'],
    })
  })

  it('spells out every flag rather than leaving the admin to re-derive a default', () => {
    expect(fieldNamed('slug')).toMatchObject({
      kind: 'slug',
      required: false,
      localized: false,
      unique: true,
      hasCustomValidation: false,
    })
  })

  it('describes localized as the admin metadata it is, not as a storage directive', () => {
    expect(fieldNamed('title').localized).toBe(true)
    expect(fieldNamed('title').options).toEqual({ max: 200 })
  })

  it('resolves the defaults of the contract, such as a relation that restricts deletion', () => {
    expect(fieldNamed('author').options).toEqual({
      to: 'author',
      many: false,
      onDelete: 'restrict',
    })
  })

  it('widens select options into value and label, which the admin renders directly', () => {
    expect(fieldNamed('audience').options.options).toEqual([
      { value: 'everyone' },
      { value: 'members', label: 'Members' },
    ])
  })

  it('carries the admin panel settings, including a display condition', () => {
    expect(fieldNamed('title').admin).toEqual({
      label: 'Title',
      help: 'Shown in listings',
      group: 'Content',
    })
    expect(fieldNamed('secret').admin).toEqual({
      showWhen: { field: 'audience', equals: 'members' },
    })
  })

  it('carries a default value the admin can prefill a form with', () => {
    expect(fieldNamed('tone').default).toBe('neutral')
    expect('default' in fieldNamed('title')).toBe(false)
  })

  it('reports that a custom rule exists, since a function cannot cross into JSON', () => {
    expect(fieldNamed('secret').hasCustomValidation).toBe(true)
    expect(JSON.stringify(fieldNamed('secret'))).not.toContain('function')
  })

  it('refuses to describe a set whose relation points nowhere', () => {
    expect(() => buildSchemaDocument([article])).toThrow(/points at "author"/)
  })
})

describe('renderSchemaJson', () => {
  it('renders JSON a reader can diff, ending with a newline', () => {
    const text = renderSchemaJson([article, author])

    expect(text.endsWith('}\n')).toBe(true)
    expect(text.split('\n')[1]).toBe('  "contract": "schema@1.0",')
  })

  it('survives the round-trip it exists for', () => {
    expect(JSON.parse(renderSchemaJson([article, author]))).toEqual(
      JSON.parse(JSON.stringify(document)),
    )
  })
})
