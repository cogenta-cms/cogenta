import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
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
  readonly edges: readonly { readonly node: Record<string, unknown> }[]
}

/**
 * The acceptance criterion of L1, in GraphQL:
 *
 *   "The `public` role cannot reach any draft, on any route, in REST as in
 *    GraphQL."
 *
 * The interesting word is *any*. So this file does not check one query: it
 * checks every shape a caller could try — by id, by list, by filter on
 * `status`, through a relation, and through an alias — and asserts that none of
 * them produces an unpublished entry.
 */
describe('the public role and drafts', () => {
  let harness: Harness
  let draftId: string
  let publishedId: string
  let pendingEditId: string

  beforeEach(async () => {
    harness = await createHarness()
    const articles = storeOf(harness, ARTICLE)

    const draft = await articles.create({ values: { title: 'Secret plans', slug: 'secret' } })
    draftId = draft.id

    const live = await articles.create({ values: { title: 'Public news', slug: 'news' } })
    await articles.publish(live.id)
    publishedId = live.id

    // A published entry carrying an unpublished edit: the subtlest case, since
    // the entry itself is legitimately readable.
    const edited = await articles.create({ values: { title: 'Stable title', slug: 'stable' } })
    await articles.publish(edited.id)
    await articles.update(edited.id, { values: { title: 'Rewritten title' } })
    pendingEditId = edited.id
  })

  afterEach(async () => {
    await harness.dispose()
  })

  const publicTitles = async (query: string): Promise<string[]> => {
    const connection = dataOf(await harness.run(query, asPublic()))['gqlArticles'] as Connection
    return connection.edges.map((edge) => String(edge.node['title'])).sort()
  }

  it('never returns a draft by identifier', async () => {
    const data = dataOf(
      await harness.run(`query ($id: ID!) { gqlArticle(id: $id) { id title } }`, asPublic(), {
        id: draftId,
      }),
    )
    expect(data['gqlArticle']).toBeNull()
  })

  it('never lists a draft', async () => {
    expect(await publicTitles('{ gqlArticles(limit: 50) { edges { node { title } } } }')).toEqual([
      'Public news',
      'Stable title',
    ])
  })

  it('returns nothing when a filter asks for drafts explicitly', async () => {
    // The dangerous one: `status` is the single `ListOptions` field that would
    // replace the published-only predicate if a user filter reached it.
    expect(
      await publicTitles(
        '{ gqlArticles(filter: { status: { eq: DRAFT } }, limit: 50) { edges { node { title } } } }',
      ),
    ).toEqual([])
    expect(
      await publicTitles(
        '{ gqlArticles(filter: { status: { ne: PUBLISHED } }, limit: 50) { edges { node { title } } } }',
      ),
    ).toEqual([])
    expect(
      await publicTitles(
        '{ gqlArticles(filter: { or: [{ status: { eq: DRAFT } }, { status: { eq: ARCHIVED } }] }, limit: 50) { edges { node { title } } } }',
      ),
    ).toEqual([])
  })

  it('shows the published text of an entry whose newest edit is a draft', async () => {
    const data = dataOf(
      await harness.run(`query ($id: ID!) { gqlArticle(id: $id) { title } }`, asPublic(), {
        id: pendingEditId,
      }),
    )
    expect(data['gqlArticle']).toEqual({ title: 'Stable title' })
  })

  it('never reaches a draft through a relation', async () => {
    const articles = storeOf(harness, ARTICLE)
    await articles.update(publishedId, { values: { related: [draftId, pendingEditId] } })
    await articles.publish(publishedId)

    const data = dataOf(
      await harness.run(
        `query ($id: ID!) { gqlArticle(id: $id) { title related { id title } } }`,
        asPublic(),
        { id: publishedId },
      ),
    )
    const article = data['gqlArticle'] as { related: readonly Record<string, unknown>[] }

    // The draft is simply absent from the list rather than present as null:
    // "there is no such entry" is the honest answer to a reader who may not see
    // it, and it does not confirm that an entry with that id exists.
    expect(article.related.map((entry) => entry['id'])).toEqual([pendingEditId])
    expect(article.related[0]?.['title']).toBe('Stable title')
  })

  it('is not fooled by aliases or by repeating the field', async () => {
    const data = dataOf(
      await harness.run(
        `query ($draft: ID!, $live: ID!) {
           a: gqlArticle(id: $draft) { title }
           b: gqlArticle(id: $live) { title }
           c: gqlArticle(id: $draft) { title }
         }`,
        asPublic(),
        { draft: draftId, live: publishedId },
      ),
    )
    expect(data['a']).toBeNull()
    expect(data['c']).toBeNull()
    expect(data['b']).toEqual({ title: 'Public news' })
  })

  it('lets an editor see the working copy on the same queries', async () => {
    const data = dataOf(
      await harness.run(`query ($id: ID!) { gqlArticle(id: $id) { title } }`, asEditor(), {
        id: pendingEditId,
      }),
    )
    expect(data['gqlArticle']).toEqual({ title: 'Rewritten title' })

    const connection = dataOf(
      await harness.run('{ gqlArticles(limit: 50) { edges { node { title } } } }', asEditor()),
    )['gqlArticles'] as Connection
    expect(connection.edges.map((edge) => edge.node['title'])).toContain('Secret plans')
  })

  // ------------------------------------------------------------- preview

  const withPreview = (entryId: string, expiresAt = Date.now() + 60_000): AccessContext => ({
    actor: ANONYMOUS,
    preview: { collection: ARTICLE.name, entryId, expiresAt },
  })

  it('opens exactly the entry a preview token names, and no other draft', async () => {
    const articles = storeOf(harness, ARTICLE)
    const other = await articles.create({ values: { title: 'Other secret', slug: 'other' } })

    const byId = dataOf(
      await harness.run(
        `query ($id: ID!) { gqlArticle(id: $id) { title } }`,
        withPreview(draftId),
        {
          id: draftId,
        },
      ),
    )
    expect(byId['gqlArticle']).toEqual({ title: 'Secret plans' })

    // The whole point of `previewCovers`: the grant is a key to one entry, and
    // a second draft must stay shut even inside the same request.
    const neighbour = dataOf(
      await harness.run(
        `query ($id: ID!) { gqlArticle(id: $id) { title } }`,
        withPreview(draftId),
        {
          id: other.id,
        },
      ),
    )
    expect(neighbour['gqlArticle']).toBeNull()
  })

  it('shows only the granted draft in a paginated connection', async () => {
    const articles = storeOf(harness, ARTICLE)
    await articles.create({ values: { title: 'Other secret', slug: 'other' } })

    const connection = dataOf(
      await harness.run(
        '{ gqlArticles(limit: 50) { edges { node { title } } } }',
        withPreview(draftId),
      ),
    )['gqlArticles'] as Connection
    const titles = connection.edges.map((edge) => String(edge.node['title']))

    expect(titles).toContain('Secret plans')
    expect(titles).not.toContain('Other secret')
  })

  it('shows only the granted draft through a relation, batched loader included', async () => {
    const articles = storeOf(harness, ARTICLE)
    const other = await articles.create({ values: { title: 'Other secret', slug: 'other' } })
    await articles.update(publishedId, { values: { related: [draftId, other.id] } })
    await articles.publish(publishedId)

    const data = dataOf(
      await harness.run(
        `query ($id: ID!) { gqlArticle(id: $id) { related { title } } }`,
        withPreview(draftId),
        { id: publishedId },
      ),
    )
    const article = data['gqlArticle'] as { related: readonly Record<string, unknown>[] }
    expect(article.related.map((entry) => entry['title'])).toEqual(['Secret plans'])
  })

  it('gives nothing at all once the token has expired', async () => {
    const data = dataOf(
      await harness.run(
        `query ($id: ID!) { gqlArticle(id: $id) { title } }`,
        withPreview(draftId, Date.now() - 1),
        { id: draftId },
      ),
    )
    expect(data['gqlArticle']).toBeNull()
  })
})
