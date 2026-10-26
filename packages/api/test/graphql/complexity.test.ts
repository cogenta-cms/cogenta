import { getIntrospectionQuery, parse } from 'graphql'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  checkComplexity,
  DEFAULT_GRAPHQL_LIMITS,
  executeGraphQL,
  type GraphQLLimits,
} from '../../src/graphql/index.js'
import {
  ARTICLE,
  AUTHOR,
  asPublic,
  createHarness,
  dataOf,
  type Harness,
  storeOf,
} from './harness.js'

/**
 * The per-document budget (pentest 2026-10-26, O-01).
 *
 * What matters is not only that an oversized document is refused but *when*:
 * before a single store was asked for anything. Every refusal test therefore
 * spies on the real stores' `list` and asserts it was never called, and the
 * positive control proves the same spy does see a document that is allowed to
 * run, so a refusal cannot be a spy that watches the wrong thing.
 */

const LIMITS: GraphQLLimits = { maxRootFields: 3, maxSelections: 20, maxDepth: 5 }

const aliases = (count: number, body = 'edges { node { title } }'): string =>
  `{ ${Array.from({ length: count }, (_, index) => `a${index}: gqlArticles(limit: 1) { ${body} }`).join(' ')} }`

/** `levels` nested `related { … }` around `title`, under one root field. */
const nest = (levels: number): string => {
  let inner = 'title'
  for (let level = 0; level < levels; level += 1) inner = `related { ${inner} }`
  return `{ gqlArticles(limit: 1) { edges { node { ${inner} } } } }`
}

function listSpies(harness: Harness): readonly ReturnType<typeof vi.spyOn>[] {
  return [ARTICLE, AUTHOR].map((collection) => vi.spyOn(storeOf(harness, collection), 'list'))
}

function listCalls(spies: readonly ReturnType<typeof vi.spyOn>[]): number {
  return spies.reduce((total, spy) => total + spy.mock.calls.length, 0)
}

describe('the per-document budget', () => {
  let harness: Harness
  let spies: readonly ReturnType<typeof vi.spyOn>[]

  beforeAll(async () => {
    harness = await createHarness({ limits: LIMITS })
    const author = await storeOf(harness, AUTHOR).create({ values: { name: 'Ada' } })
    await storeOf(harness, AUTHOR).publish(author.id)
    const created = await storeOf(harness, ARTICLE).create({
      values: { title: 'One', slug: 'one', author: author.id },
    })
    await storeOf(harness, ARTICLE).publish(created.id)
    spies = listSpies(harness)
  })

  afterAll(async () => {
    vi.restoreAllMocks()
    await harness.dispose()
  })

  const refusal = async (query: string, operationName?: string) => {
    for (const spy of spies) spy.mockClear()
    const response = await executeGraphQL(
      { query, operationName },
      {
        schema: harness.schema,
        gateway: harness.gateway,
        access: { actor: asPublic().actor },
        limits: LIMITS,
      },
    )
    return { response, calls: listCalls(spies) }
  }

  it('runs a document that stays within every limit', async () => {
    for (const spy of spies) spy.mockClear()

    const data = dataOf(await harness.run(aliases(3, 'edges { node { title } }'), asPublic()))

    expect(Object.keys(data)).toEqual(['a0', 'a1', 'a2'])
    // The positive control: the spy does see a document that is allowed to run.
    expect(listCalls(spies)).toBeGreaterThan(0)
  })

  it('refuses one root field more than the limit before any store is read', async () => {
    const { response, calls } = await refusal(aliases(LIMITS.maxRootFields + 1))

    expect(response.data).toBeUndefined()
    expect(response.errors).toHaveLength(1)
    expect(response.errors?.[0]?.extensions).toMatchObject({
      code: 'GRAPHQL_QUERY_TOO_COMPLEX',
      rule: 'rootFields',
      limit: LIMITS.maxRootFields,
    })
    expect(response.errors?.[0]?.message).toContain('4 root fields')
    expect(calls).toBe(0)
  })

  it('counts aliases of the same field as separate root fields', async () => {
    const { response } = await refusal(
      '{ x: __typename y: __typename z: __typename w: __typename }',
    )

    expect(response.errors?.[0]?.extensions?.['rule']).toBe('rootFields')
  })

  it('counts root fields spread through a fragment on the root type', async () => {
    const { response, calls } = await refusal(
      `{ ...Roots } fragment Roots on Query { ${Array.from({ length: 4 }, (_, i) => `a${i}: gqlArticles(limit: 1) { edges { node { title } } }`).join(' ')} }`,
    )

    expect(response.errors?.[0]?.extensions?.['rule']).toBe('rootFields')
    expect(calls).toBe(0)
  })

  it('refuses one level of depth more than the limit before any store is read', async () => {
    // root(1) > edges(2) > node(3) > related… > title: `levels` of related add `levels` + 1.
    const fits = LIMITS.maxDepth - 4
    for (const spy of spies) spy.mockClear()
    expect((await harness.run(nest(fits), asPublic())).errors).toBeUndefined()

    const { response, calls } = await refusal(nest(fits + 1))

    expect(response.errors?.[0]?.extensions).toMatchObject({
      code: 'GRAPHQL_QUERY_TOO_COMPLEX',
      rule: 'depth',
      limit: LIMITS.maxDepth,
    })
    expect(calls).toBe(0)
  })

  it('refuses one field selection more than the limit before any store is read', async () => {
    // One root field: the field itself plus edges, node and the leaves.
    const leaves = (count: number): string =>
      Array.from({ length: count }, (_, i) => `f${i}: title`).join(' ')
    const query = (count: number): string =>
      `{ gqlArticles(limit: 1) { edges { node { ${leaves(count)} } } } }`
    // gqlArticles + edges + node = 3, so 17 leaves is exactly the limit of 20.
    for (const spy of spies) spy.mockClear()
    expect((await harness.run(query(17), asPublic())).errors).toBeUndefined()

    const { response, calls } = await refusal(query(18))

    expect(response.errors?.[0]?.extensions).toMatchObject({
      code: 'GRAPHQL_QUERY_TOO_COMPLEX',
      rule: 'selections',
      limit: LIMITS.maxSelections,
    })
    expect(calls).toBe(0)
  })

  it('counts a fragment every time it is spread', async () => {
    // Four selections each (frag fields), spread seven times under one field:
    // 1 + 7 * 3 = 22 > 20, though the document text names only 3 fields.
    const query = `{ gqlArticles(limit: 1) { edges { node { ${'...F '.repeat(7)} } } } }
      fragment F on GqlArticle { title slug views }`
    const { response, calls } = await refusal(query)

    expect(response.errors?.[0]?.extensions?.['rule']).toBe('selections')
    expect(calls).toBe(0)
  })

  it('does not expand a fragment bomb: nested spreads are measured once each', async () => {
    // F9 spreads F8 ten times, F8 spreads F7 ten times, … — 10^9 selections
    // when expanded. It must be refused at once, not walked.
    const levels = Array.from({ length: 9 }, (_, i) => {
      const next = i === 0 ? 'title' : `${'...F'.concat(String(i - 1), ' ').repeat(10)}`
      return `fragment F${i} on GqlArticle { ${next} }`
    })
    const query = `{ gqlArticles(limit: 1) { edges { node { ...F8 } } } } ${levels.join(' ')}`

    const started = performance.now()
    const { response, calls } = await refusal(query)

    expect(response.errors?.[0]?.extensions?.['rule']).toBe('selections')
    expect(calls).toBe(0)
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('measures only the operation that is going to run', async () => {
    const query = `query Small { gqlArticles(limit: 1) { edges { node { title } } } }
      query Large ${aliases(LIMITS.maxRootFields + 1)}`
    const small = await refusal(query, 'Small')
    const large = await refusal(query, 'Large')

    expect(small.response.errors).toBeUndefined()
    expect(large.response.errors?.[0]?.extensions?.['code']).toBe('GRAPHQL_QUERY_TOO_COMPLEX')
  })

  it('still reports an ordinary validation error as QUERY_INVALID', async () => {
    const { response } = await refusal('{ noSuchField }')

    expect(response.errors?.[0]?.extensions?.['code']).toBe('QUERY_INVALID')
  })
})

describe('the default budget', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await createHarness()
    const created = await storeOf(harness, ARTICLE).create({
      values: { title: 'One', slug: 'one' },
    })
    await storeOf(harness, ARTICLE).publish(created.id)
  })

  afterAll(async () => {
    await harness.dispose()
  })

  it('is 20 root fields, 1000 selections and a depth of 12', () => {
    expect(DEFAULT_GRAPHQL_LIMITS).toEqual({ maxRootFields: 20, maxSelections: 1000, maxDepth: 12 })
  })

  it('refuses the 25 aliased list fields of the pentest observation', async () => {
    const response = await harness.run(aliases(25), asPublic())

    expect(response.errors?.[0]?.extensions?.['code']).toBe('GRAPHQL_QUERY_TOO_COMPLEX')
  })

  it('accepts twenty aliased list fields', async () => {
    const data = dataOf(await harness.run(aliases(20), asPublic()))

    expect(Object.keys(data)).toHaveLength(20)
  })

  it('accepts a realistic client document with relations and fragments', async () => {
    const query = `
      query Page($after: String) {
        gqlArticles(limit: 25, after: $after, sort: [{ field: CREATED_AT, direction: DESC }]) {
          edges { cursor node { ...Card related { ...Card author { name } } author { name } } }
          pageInfo { hasNextPage endCursor }
        }
        gqlAuthors(limit: 10) { edges { node { id name } } }
      }
      fragment Card on GqlArticle { id title slug views featured status provenance }`

    expect((await harness.run(query, asPublic())).errors).toBeUndefined()
  })

  it('accepts the full introspection query (GraphiQL, codegen)', async () => {
    for (const options of [
      {},
      {
        descriptions: true,
        specifiedByUrl: true,
        schemaDescription: true,
        inputValueDeprecation: true,
      },
    ]) {
      const response = await harness.run(getIntrospectionQuery(options), asPublic())

      expect(response.errors).toBeUndefined()
      expect(response.data?.['__schema']).toBeDefined()
    }
  })

  it('lets an operator loosen or tighten the limits per site', async () => {
    const loose = await createHarness({ limits: { maxRootFields: 30 } })
    const tight = await createHarness({ limits: { maxRootFields: 2 } })
    try {
      expect((await loose.run(aliases(25), asPublic())).errors).toBeUndefined()
      expect((await tight.run(aliases(3), asPublic())).errors?.[0]?.extensions?.['code']).toBe(
        'GRAPHQL_QUERY_TOO_COMPLEX',
      )
    } finally {
      await loose.dispose()
      await tight.dispose()
    }
  })
})

describe('introspection under the budget', () => {
  const limits: GraphQLLimits = { maxRootFields: 20, maxSelections: 10, maxDepth: 3 }
  const introspection = parse(getIntrospectionQuery())

  it('does not count the introspection subtree against selections or depth', () => {
    expect(checkComplexity(introspection, undefined, limits)).toBeUndefined()
  })

  it('still counts every aliased __schema as a root field', () => {
    const document = parse(
      `{ ${Array.from({ length: 21 }, (_, i) => `s${i}: __schema { queryType { name } }`).join(' ')} }`,
    )

    expect(checkComplexity(document, undefined, limits)).toMatchObject({ rule: 'rootFields' })
  })

  it('gives the introspection subtree a ceiling of its own', () => {
    // I0 is one field; each Ik spreads I(k-1) four times: 4^7 selections.
    const fragments = Array.from({ length: 8 }, (_, level) =>
      level === 0
        ? 'fragment I0 on __Type { name }'
        : `fragment I${level} on __Type { ${`...I${level - 1} `.repeat(4)} }`,
    )
    const document = parse(`{ __schema { types { ...I7 } } } ${fragments.join(' ')}`)

    expect(checkComplexity(document, undefined, limits)).toMatchObject({ rule: 'introspection' })
  })
})
