import { describe, expect, it } from 'vitest'
import { buildContentSchema, renderSdl } from '../../src/graphql/index.js'
import { ARTICLE, AUTHOR, COLLECTIONS } from './harness.js'

/**
 * The SDL is printed from the very schema that answers the queries, so these
 * assertions are about the *derivation*: what a collection's fields become.
 */
describe('the generated SDL', () => {
  const sdl = renderSdl({ collections: COLLECTIONS })

  it('gives a collection one type carrying its declared and its system fields', () => {
    // `gql_article` becomes `GqlArticle` — the very function that names it in
    // `.cogenta/types.d.ts`, so the SDL and the generated types agree.
    expect(sdl).toContain('type GqlArticle {')
    // Declared fields, with the nullability of the generated TypeScript types:
    // a required field is non-null, a list is never null, the rest is nullable.
    expect(sdl).toMatch(/type GqlArticle[\s\S]*?title: String!/)
    expect(sdl).toMatch(/type GqlArticle[\s\S]*?slug: String\n/)
    expect(sdl).toMatch(/type GqlArticle[\s\S]*?views: Int\n/)
    expect(sdl).toMatch(/type GqlArticle[\s\S]*?body: \[Block!\]!/)
    // Every system field of contract A, provenance included.
    for (const field of ['id: ID!', 'status: ContentStatus!', 'provenance: Provenance!']) {
      expect(sdl).toMatch(
        new RegExp(`type GqlArticle[\\s\\S]*?${field.replace(/[![\]]/g, '\\$&')}`),
      )
    }
  })

  it('expands a relation into the target type rather than into an identifier', () => {
    expect(sdl).toMatch(/type GqlArticle[\s\S]*?author: GqlAuthor/)
    expect(sdl).toMatch(/type GqlArticle[\s\S]*?related: \[GqlArticle!\]!/)
  })

  it('gives each collection a cursor connection, never an offset one', () => {
    expect(sdl).toContain('type GqlArticleConnection')
    expect(sdl).toContain('type GqlArticleEdge')
    expect(sdl).toMatch(/type GqlArticleEdge[\s\S]*?node: GqlArticle!/)
    expect(sdl).toMatch(/type GqlArticleEdge[\s\S]*?cursor: String!/)
    expect(sdl).toMatch(/type PageInfo[\s\S]*?hasNextPage: Boolean!/)
    expect(sdl).toMatch(/type PageInfo[\s\S]*?endCursor: String/)
    // No `offset:` argument anywhere: an offset drifts on a live collection,
    // which is precisely why the spec asks for cursors.
    expect(sdl).not.toMatch(/\boffset:/)
    expect(sdl).not.toMatch(/\bpage:/)
  })

  it('exposes the filter vocabulary of the seam and nothing beyond it', () => {
    expect(sdl).toMatch(
      /input StringFilter[\s\S]*?eq: String[\s\S]*?ne: String[\s\S]*?lt: String[\s\S]*?lte: String[\s\S]*?gt: String[\s\S]*?gte: String[\s\S]*?in: \[String!\][\s\S]*?contains: String[\s\S]*?exists: Boolean/,
    )
    expect(sdl).toMatch(/input GqlArticleFilter[\s\S]*?and: \[GqlArticleFilter!\]/)
    expect(sdl).toMatch(/input GqlArticleFilter[\s\S]*?or: \[GqlArticleFilter!\]/)
  })

  it('declares the five mutations of a collection', () => {
    for (const mutation of [
      'createGqlArticle(',
      'updateGqlArticle(',
      'deleteGqlArticle(',
      'publishGqlArticle(',
      'restoreGqlArticle(',
    ]) {
      expect(sdl).toContain(mutation)
    }
  })

  it('never offers a way to ask for a draft', () => {
    // The acceptance criterion is enforced by the gateway, but a `state:` or
    // `draft:` argument in the schema would be the first step to undoing it.
    expect(sdl).not.toMatch(/\bstate:/)
    expect(sdl).not.toMatch(/\bdraft:/)
    expect(sdl).not.toMatch(/\bpreview:/)
  })

  it('is the schema that will be executed, not a second description of it', () => {
    const schema = buildContentSchema({ collections: COLLECTIONS })
    expect(schema.getType('GqlArticle')).toBeDefined()
    expect(schema.getQueryType()?.getFields()['gqlArticles']).toBeDefined()
    expect(schema.getQueryType()?.getFields()['gqlArticle']).toBeDefined()
  })

  it('derives every name from the collection, so the order of declaration is irrelevant', () => {
    expect(renderSdl({ collections: [AUTHOR, ARTICLE] })).toBe(sdl)
  })
})
