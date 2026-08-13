import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asEditor,
  asPublic,
  createHarness,
  dataOf,
  type Harness,
  storeOf,
} from './harness.js'

describe('writing content over GraphQL', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  const create = async (input: string): Promise<Record<string, unknown>> => {
    const data = dataOf(
      await harness.run(
        `mutation { createGqlArticle(input: ${input}) { id title status } }`,
        asEditor(),
      ),
    )
    return data['createGqlArticle'] as Record<string, unknown>
  }

  it('creates a draft', async () => {
    const created = await create('{ title: "First", slug: "first" }')
    expect(created).toMatchObject({ title: 'First', status: 'DRAFT' })
  })

  it('accepts blocks as semantic data, and mints a key for a block that has none', async () => {
    const data = dataOf(
      await harness.run(
        `mutation {
           createGqlArticle(input: {
             title: "With blocks",
             body: [{ type: "richText", data: { text: "hello" } }]
           }) { id body { key type data } }
         }`,
        asEditor(),
      ),
    )
    const created = data['createGqlArticle'] as { body: readonly Record<string, unknown>[] }

    expect(created.body).toHaveLength(1)
    expect(created.body[0]).toMatchObject({ type: 'richText', data: { text: 'hello' } })
    // Contract A's `_key`: minted once, never recomputed from the position.
    expect(created.body[0]?.['key']).toBeTypeOf('string')
    expect(created.body[0]?.['key']).not.toBe('')
  })

  it('updates an entry', async () => {
    const created = await create('{ title: "Before", slug: "before" }')
    const data = dataOf(
      await harness.run(
        `mutation ($id: ID!) { updateGqlArticle(id: $id, input: { title: "After" }) { title } }`,
        asEditor(),
        { id: created['id'] },
      ),
    )
    expect(data['updateGqlArticle']).toEqual({ title: 'After' })
  })

  it('publishes an entry, and only then does the public see it', async () => {
    const created = await create('{ title: "Announcement", slug: "announcement" }')
    const id = String(created['id'])

    expect(
      dataOf(await harness.run(`{ gqlArticle(id: "${id}") { title } }`, asPublic()))['gqlArticle'],
    ).toBeNull()

    const published = dataOf(
      await harness.run(
        `mutation ($id: ID!) { publishGqlArticle(id: $id) { status } }`,
        asEditor(),
        { id },
      ),
    )
    expect(published['publishGqlArticle']).toEqual({ status: 'PUBLISHED' })

    expect(
      dataOf(await harness.run(`{ gqlArticle(id: "${id}") { title } }`, asPublic()))['gqlArticle'],
    ).toEqual({ title: 'Announcement' })
  })

  it('restores a kept version as a new version', async () => {
    const created = await create('{ title: "Original", slug: "original" }')
    const id = String(created['id'])
    await harness.run(
      `mutation ($id: ID!) { updateGqlArticle(id: $id, input: { title: "Changed" }) { title } }`,
      asEditor(),
      { id },
    )

    const data = dataOf(
      await harness.run(
        `mutation ($id: ID!) { restoreGqlArticle(id: $id, version: 1) { title version } }`,
        asEditor(),
        { id },
      ),
    )
    const restored = data['restoreGqlArticle'] as Record<string, unknown>

    expect(restored['title']).toBe('Original')
    // The history stays append-only: restoring is an edit, not a rewind.
    expect(Number(restored['version'])).toBeGreaterThan(2)
  })

  it('deletes an entry', async () => {
    const created = await create('{ title: "Doomed", slug: "doomed" }')
    const id = String(created['id'])

    expect(
      dataOf(
        await harness.run(`mutation ($id: ID!) { deleteGqlArticle(id: $id) }`, asEditor(), { id }),
      ),
    ).toEqual({ deleteGqlArticle: true })
    expect(await storeOf(harness, ARTICLE).read(id, { state: 'working' })).toBeNull()
  })

  it('refuses every mutation to the public role', async () => {
    const created = await create('{ title: "Guarded", slug: "guarded" }')
    const id = String(created['id'])

    const attempts = [
      `mutation { createGqlArticle(input: { title: "Nope" }) { id } }`,
      `mutation { updateGqlArticle(id: "${id}", input: { title: "Nope" }) { id } }`,
      `mutation { deleteGqlArticle(id: "${id}") }`,
      `mutation { publishGqlArticle(id: "${id}") { id } }`,
      `mutation { restoreGqlArticle(id: "${id}", version: 1) { id } }`,
    ]

    for (const attempt of attempts) {
      const response = await harness.run(attempt, asPublic())
      expect(response.errors?.[0]?.extensions?.['code']).toBe('FORBIDDEN')
    }
  })

  it('never leaks a value, a hint of SQL or a stack in an error', async () => {
    const response = await harness.run(
      `mutation { updateGqlArticle(id: "018f0000-0000-7000-8000-00000000dead", input: { title: "Ghost" }) { id } }`,
      asEditor(),
    )
    const rendered = JSON.stringify(response.errors)

    expect(response.errors?.[0]?.extensions?.['code']).toBe('CONTENT_NOT_FOUND')
    // Not the identifier that was passed, not the table, not the statement.
    expect(rendered).not.toContain('018f0000-0000-7000-8000-00000000dead')
    expect(rendered).not.toContain('gql_article')
    expect(rendered).not.toMatch(/select |insert |update |delete from/i)
    expect(rendered).not.toContain('stack')
  })
})
