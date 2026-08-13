import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defineCollection } from '../src/define-collection.js'
import { f } from '../src/fields.js'
import { interfaceName, renderTypeDeclarations } from '../src/generate-types.js'
import type { CollectionDefinition } from '../src/types.js'

const author = defineCollection({
  name: 'author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    bio: f.richText(),
  },
  permissions: { read: ['public'] },
})

/** One collection using every field type, so the golden file covers all 14. */
const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({
      required: true,
      max: 200,
      localized: true,
      admin: { label: 'Title', help: 'Shown in listings' },
    }),
    slug: f.slug({ from: 'title', unique: true, required: true }),
    cover: f.media({ accept: ['image'] }),
    gallery: f.media({ many: true }),
    author: f.relation({ to: 'author', required: true }),
    related: f.relation({ to: 'article', many: true }),
    audience: f.select({ options: ['everyone', { value: 'members', label: 'Members' }] }),
    channels: f.select({ options: ['web', 'print'], many: true }),
    readingTime: f.number({ integer: true }),
    featured: f.boolean({ required: true }),
    releaseDate: f.date(),
    publishedAt: f.datetime(),
    metadata: f.json(),
    location: f.geo(),
    accent: f.color(),
    body: f.richText({ localized: true }),
    zone: f.blocks({ allow: ['hero', 'prose'] }),
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: { read: ['public'], create: ['editor'], publish: ['admin'] },
})

const golden = readFileSync(
  fileURLToPath(new URL('./fixtures/types.d.ts.expected', import.meta.url)),
  'utf8',
)

/** The declared type of one property of one generated interface. */
function typeOf(source: string, collection: string, field: string): string | undefined {
  const body = source
    .split(`export interface ${collection} extends SystemFields {`)[1]
    ?.split('}')[0]
  return body
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith(`readonly ${field}:`))
    ?.slice(`readonly ${field}:`.length)
    .trim()
}

describe('renderTypeDeclarations', () => {
  it('renders exactly the declarations of the golden file', () => {
    expect(renderTypeDeclarations([article, author])).toBe(golden)
  })

  it('renders the same string whatever order the collections arrive in', () => {
    expect(renderTypeDeclarations([author, article])).toBe(
      renderTypeDeclarations([article, author]),
    )
  })

  it('names an interface after its collection, in PascalCase', () => {
    expect(interfaceName('article')).toBe('Article')
    expect(interfaceName('blog_post')).toBe('BlogPost')
  })
})

describe('renderTypeDeclarations — the type of each field kind', () => {
  const source = renderTypeDeclarations([article, author])

  it.each([
    ['title', 'string'],
    ['slug', 'string'],
    ['body', 'RichTextDocument | null'],
    ['readingTime', 'number | null'],
    ['featured', 'boolean'],
    ['releaseDate', 'string | null'],
    ['publishedAt', 'string | null'],
    ['cover', 'CogentaId | null'],
    ['author', 'CogentaId'],
    ['audience', "'everyone' | 'members' | null"],
    ['metadata', 'JsonValue | null'],
    ['location', 'GeoPoint | null'],
    ['accent', 'string | null'],
    ['zone', 'readonly ContentBlock[]'],
  ])('types %s as %s', (field, expected) => {
    expect(typeOf(source, 'Article', field)).toBe(expected)
  })

  it('types a to-many field as a list that is never null, since a join table has rows or none', () => {
    expect(typeOf(source, 'Article', 'gallery')).toBe('readonly CogentaId[]')
    expect(typeOf(source, 'Article', 'related')).toBe('readonly CogentaId[]')
    expect(typeOf(source, 'Article', 'channels')).toBe("readonly ('web' | 'print')[]")
  })

  it('gives every collection the system fields without declaring them twice', () => {
    expect(source).toContain('export interface Article extends SystemFields {')
    expect(source).toContain('export interface Author extends SystemFields {')
    expect(source).toContain('readonly provenance: Provenance')
    expect(typeOf(source, 'Article', 'provenance')).toBeUndefined()
  })

  it('registers every collection by name, which is what a typed client looks up', () => {
    expect(source).toContain('readonly article: Article')
    expect(source).toContain('readonly author: Author')
    expect(source).toContain('export type CollectionName = keyof CollectionTypes')
  })

  it('imports nothing, so a theme compiles against it without @cogenta/schema', () => {
    expect(source).not.toContain('import ')
  })

  it('excludes h1 from the rich text it declares, as the contract does', () => {
    expect(source).toContain("readonly style: 'normal' | 'h2' | 'h3' | 'h4' | 'blockquote'")
  })

  it('carries the admin label and help into a doc comment, for editor autocompletion', () => {
    expect(source).toContain('/** Title — Shown in listings — Translated field. */')
  })
})

describe('renderTypeDeclarations — refusals', () => {
  it('refuses to generate for a relation whose target does not exist', () => {
    const orphan: CollectionDefinition = defineCollection({
      name: 'comment',
      labels: { singular: 'Comment', plural: 'Comments' },
      fields: { post: f.relation({ to: 'post', required: true }) },
      permissions: { read: ['public'] },
    })

    expect(() => renderTypeDeclarations([orphan])).toThrow(/points at "post"/)
  })
})
