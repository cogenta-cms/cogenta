import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asEditor,
  asPublic,
  createHarness,
  dataOf,
  type Harness,
  storeOf,
} from './harness.js'

interface Connection {
  readonly edges: readonly { readonly cursor: string; readonly node: Record<string, unknown> }[]
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null }
}

describe('reading content over GraphQL', () => {
  let harness: Harness
  let first: string

  beforeAll(async () => {
    harness = await createHarness()
    const articles = storeOf(harness, ARTICLE)

    for (const [index, title] of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].entries()) {
      const created = await articles.create({
        values: {
          title,
          slug: title.toLowerCase(),
          views: index * 10,
          featured: index % 2 === 0,
        },
      })
      await articles.publish(created.id)
      if (title === 'Alpha') first = created.id
    }
  })

  afterAll(async () => {
    await harness.dispose()
  })

  it('returns one entry by identifier', async () => {
    const data = dataOf(
      await harness.run(
        `query ($id: ID!) { gqlArticle(id: $id) { id title slug views status provenance } }`,
        asPublic(),
        { id: first },
      ),
    )

    expect(data['gqlArticle']).toMatchObject({
      id: first,
      title: 'Alpha',
      slug: 'alpha',
      views: 0,
      status: 'PUBLISHED',
      provenance: 'HUMAN',
    })
  })

  it('returns null for an identifier that names nothing', async () => {
    const data = dataOf(
      await harness.run(
        `{ gqlArticle(id: "018f0000-0000-7000-8000-00000000dead") { id } }`,
        asEditor(),
      ),
    )
    expect(data['gqlArticle']).toBeNull()
  })

  it('pages by cursor, and the next page continues where the first stopped', async () => {
    const page1 = dataOf(
      await harness.run(
        `{ gqlArticles(limit: 2, sort: [{ field: CREATED_AT, direction: ASC }]) {
             edges { cursor node { title } }
             pageInfo { hasNextPage endCursor }
           } }`,
        asPublic(),
      ),
    )['gqlArticles'] as Connection

    expect(page1.edges.map((edge) => edge.node['title'])).toEqual(['Alpha', 'Beta'])
    expect(page1.pageInfo.hasNextPage).toBe(true)
    expect(page1.pageInfo.endCursor).toBeTypeOf('string')

    const page2 = dataOf(
      await harness.run(
        `query ($after: String) {
           gqlArticles(limit: 2, after: $after, sort: [{ field: CREATED_AT, direction: ASC }]) {
             edges { node { title } }
             pageInfo { hasNextPage }
           } }`,
        asPublic(),
        { after: page1.pageInfo.endCursor },
      ),
    )['gqlArticles'] as Connection

    // No overlap and no gap: that is the whole promise of a keyset cursor.
    expect(page2.edges.map((edge) => edge.node['title'])).toEqual(['Gamma', 'Delta'])
  })

  it('reports the last page as the last page', async () => {
    const connection = dataOf(
      await harness.run(
        `{ gqlArticles(limit: 50) { edges { node { title } } pageInfo { hasNextPage endCursor } } }`,
        asPublic(),
      ),
    )['gqlArticles'] as Connection

    expect(connection.edges).toHaveLength(5)
    expect(connection.pageInfo.hasNextPage).toBe(false)
    expect(connection.pageInfo.endCursor).toBeNull()
  })

  const titles = async (filter: string): Promise<string[]> => {
    const connection = dataOf(
      await harness.run(
        `{ gqlArticles(filter: ${filter}, limit: 50) { edges { node { title } } } }`,
        asPublic(),
      ),
    )['gqlArticles'] as Connection
    return connection.edges.map((edge) => String(edge.node['title'])).sort()
  }

  it('applies every operator of the filter vocabulary', async () => {
    expect(await titles('{ title: { eq: "Beta" } }')).toEqual(['Beta'])
    expect(await titles('{ title: { ne: "Beta" } }')).toEqual([
      'Alpha',
      'Delta',
      'Epsilon',
      'Gamma',
    ])
    expect(await titles('{ views: { lt: 20 } }')).toEqual(['Alpha', 'Beta'])
    expect(await titles('{ views: { lte: 20 } }')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(await titles('{ views: { gt: 30 } }')).toEqual(['Epsilon'])
    expect(await titles('{ views: { gte: 30 } }')).toEqual(['Delta', 'Epsilon'])
    expect(await titles('{ title: { in: ["Alpha", "Gamma"] } }')).toEqual(['Alpha', 'Gamma'])
    expect(await titles('{ title: { contains: "et" } }')).toEqual(['Beta'])
    expect(await titles('{ featured: { eq: true } }')).toEqual(['Alpha', 'Epsilon', 'Gamma'])
    expect(await titles('{ author: { exists: false } }')).toHaveLength(5)
    expect(await titles('{ author: { exists: true } }')).toHaveLength(0)
  })

  it('combines conditions with and and or', async () => {
    expect(await titles('{ featured: { eq: true }, views: { gt: 10 } }')).toEqual([
      'Epsilon',
      'Gamma',
    ])
    expect(await titles('{ and: [{ featured: { eq: true } }, { views: { gt: 10 } }] }')).toEqual([
      'Epsilon',
      'Gamma',
    ])
    expect(await titles('{ or: [{ title: { eq: "Beta" } }, { title: { eq: "Delta" } }] }')).toEqual(
      ['Beta', 'Delta'],
    )
  })

  it('is case-insensitive on contains, because a search box is', async () => {
    expect(await titles('{ title: { contains: "ALPH" } }')).toEqual(['Alpha'])
  })

  it('refuses to order by a nullable column, where a cursor could skip a row', async () => {
    const response = await harness.run(
      `{ gqlArticles(sort: [{ field: TITLE, direction: ASC }]) { edges { node { title } } } }`,
      asPublic(),
    )
    expect(response.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')
  })
})
