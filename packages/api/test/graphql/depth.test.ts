import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_MAX_DEPTH } from '../../src/graphql/index.js'
import { ARTICLE, asPublic, createHarness, dataOf, type Harness, storeOf } from './harness.js'

/**
 * The bound on relation expansion.
 *
 * `related` points at the same collection, so the schema is circular and a
 * document can nest it as deep as it likes. The spec asks for a configurable
 * maximum with a low default, which is what these tests hold in place.
 */
describe('bounded expansion depth', () => {
  let harness: Harness
  let head: string

  const nest = (levels: number): string => {
    let inner = 'title'
    for (let level = 0; level < levels; level += 1) inner = `related { ${inner} }`
    return `query ($id: ID!) { gqlArticle(id: $id) { ${inner} } }`
  }

  beforeAll(async () => {
    harness = await createHarness()
    const articles = storeOf(harness, ARTICLE)

    // A → B → A: two entries pointing at each other is enough to make an
    // unbounded query run until something gives.
    const a = await articles.create({ values: { title: 'A', slug: 'a' } })
    const b = await articles.create({ values: { title: 'B', slug: 'b' } })
    await articles.update(a.id, { values: { related: [b.id] } })
    await articles.update(b.id, { values: { related: [a.id] } })
    await articles.publish(a.id)
    await articles.publish(b.id)
    head = a.id
  })

  afterAll(async () => {
    await harness.dispose()
  })

  it('defaults to a low number of hops', () => {
    expect(DEFAULT_MAX_DEPTH).toBe(2)
  })

  it('answers a query that stays within the bound', async () => {
    const data = dataOf(await harness.run(nest(DEFAULT_MAX_DEPTH), asPublic(), { id: head }))
    expect(JSON.stringify(data)).toContain('"title"')
  })

  it('refuses the hop that would exceed the bound', async () => {
    const response = await harness.run(nest(DEFAULT_MAX_DEPTH + 1), asPublic(), { id: head })

    expect(response.errors).toBeDefined()
    expect(response.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')
  })

  it('stops a circular query rather than following it forever', async () => {
    const response = await harness.run(nest(40), asPublic(), { id: head })
    expect(response.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')
  })

  it('lets the caller lower the bound but never raise it', async () => {
    const lowered = await harness.run(
      `query ($id: ID!) { gqlArticle(id: $id, depth: 0) { related { title } } }`,
      asPublic(),
      { id: head },
    )
    expect(lowered.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')

    // `depth: 99` is capped at the server's own maximum, so the third hop is
    // still refused: a client-chosen depth on a circular schema would be a
    // denial of service with a polite syntax.
    const raised = await harness.run(
      `query ($id: ID!) { gqlArticle(id: $id, depth: 99) { ${'related { '.repeat(3)}title${' }'.repeat(3)} } }`,
      asPublic(),
      { id: head },
    )
    expect(raised.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')
  })

  it('honours a schema built with a different maximum', async () => {
    const deep = await createHarness({ maxDepth: 4 })
    try {
      const articles = storeOf(deep, ARTICLE)
      const a = await articles.create({ values: { title: 'A', slug: 'a' } })
      const b = await articles.create({ values: { title: 'B', slug: 'b' } })
      await articles.update(a.id, { values: { related: [b.id] } })
      await articles.update(b.id, { values: { related: [a.id] } })
      await articles.publish(a.id)
      await articles.publish(b.id)

      const data = dataOf(await deep.run(nest(4), asPublic(), { id: a.id }))
      expect(JSON.stringify(data)).toContain('"title"')

      const refused = await deep.run(nest(5), asPublic(), { id: a.id })
      expect(refused.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')
    } finally {
      await deep.dispose()
    }
  })
})
