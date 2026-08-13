import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLoader } from '../../src/graphql/index.js'
import {
  ARTICLE,
  AUTHOR,
  asPublic,
  createHarness,
  dataOf,
  type Harness,
  storeOf,
} from './harness.js'

interface Connection {
  readonly edges: readonly { readonly node: Record<string, unknown> }[]
}

describe('the loader itself', () => {
  it('turns the keys asked for in one tick into a single batch', async () => {
    const batches: (readonly string[])[] = []
    const loader = createLoader<string, string>(async (keys) => {
      batches.push([...keys])
      return new Map(keys.map((key) => [key, key.toUpperCase()]))
    })

    const found = await Promise.all([loader.load('a'), loader.load('b'), loader.load('c')])

    expect(found).toEqual(['A', 'B', 'C'])
    expect(batches).toHaveLength(1)
  })

  it('asks for a key it has already been asked for exactly once', async () => {
    let calls = 0
    const loader = createLoader<string, number>(async (keys) => {
      calls += 1
      return new Map(keys.map((key) => [key, key.length]))
    })

    await Promise.all([loader.load('same'), loader.load('same'), loader.load('same')])
    await loader.load('same')

    expect(calls).toBe(1)
  })

  it('answers null for a key the batch did not find, rather than hanging', async () => {
    const loader = createLoader<string, string>(async () => new Map())
    await expect(loader.load('missing')).resolves.toBeNull()
  })

  it('does not poison the request when a batch fails', async () => {
    let attempt = 0
    const loader = createLoader<string, string>(async (keys) => {
      attempt += 1
      if (attempt === 1) throw new Error('database went away')
      return new Map(keys.map((key) => [key, 'recovered']))
    })

    await expect(loader.load('k')).rejects.toThrow('database went away')
    await expect(loader.load('k')).resolves.toBe('recovered')
  })
})

/**
 * The N+1 the L1 spec names by name.
 *
 * The assertion counts reads rather than measuring time: a timing test passes
 * on a fast morning and a performance regression is exactly what this is meant
 * to catch. Twenty articles sharing two authors must cost two reads.
 */
describe('resolving a relation over a page of entries', () => {
  let harness: Harness
  const PAGE = 20

  beforeAll(async () => {
    harness = await createHarness()
    const articles = storeOf(harness, ARTICLE)
    const authors = storeOf(harness, AUTHOR)

    const written: string[] = []
    for (const name of ['Ada', 'Grace']) {
      const author = await authors.create({ values: { name } })
      await authors.publish(author.id)
      written.push(author.id)
    }

    for (let index = 0; index < PAGE; index += 1) {
      const created = await articles.create({
        values: {
          title: `Article ${index}`,
          slug: `article-${index}`,
          author: written[index % written.length],
        },
      })
      await articles.publish(created.id)
    }
  })

  afterAll(async () => {
    await harness.dispose()
  })

  it('reads each distinct author once, not once per article', async () => {
    harness.resetReads()

    const connection = dataOf(
      await harness.run(
        `{ gqlArticles(limit: ${PAGE}) { edges { node { title author { name } } } } }`,
        asPublic(),
      ),
    )['gqlArticles'] as Connection

    expect(connection.edges).toHaveLength(PAGE)
    for (const edge of connection.edges) {
      expect(edge.node['author']).toMatchObject({ name: expect.any(String) })
    }

    // Two distinct authors behind twenty articles. Without the loader this is
    // twenty reads; the list of articles itself costs none, since the store
    // pages them in one statement.
    expect(harness.reads()).toBe(2)
  })

  it('still reads once per distinct target when every article has its own', async () => {
    const articles = storeOf(harness, ARTICLE)
    const authors = storeOf(harness, AUTHOR)

    const solo = await authors.create({ values: { name: 'Solo' } })
    await authors.publish(solo.id)
    const created = await articles.create({
      values: { title: 'Solo article', slug: 'solo', author: solo.id },
    })
    await articles.publish(created.id)

    harness.resetReads()
    dataOf(
      await harness.run(
        `{ gqlArticles(limit: ${PAGE + 1}) { edges { node { author { name } } } } }`,
        asPublic(),
      ),
    )

    expect(harness.reads()).toBe(3)
  })
})
