import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  asPublic,
  createHarness,
  errorOf,
  type Harness,
  idsOf,
  request,
  TAG,
} from './harness.js'

/**
 * One test per operator of the frozen vocabulary, plus the two combinators.
 * The vocabulary is fixed in `src/types.ts`, so this file is what proves the
 * query-string syntax maps onto all of it and onto nothing else.
 */
describe('filters', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
    const articles = harness.store(ARTICLE)

    await articles.create({
      id: 'f1',
      status: 'published',
      values: { title: 'Alpha', summary: 'about cursors', rating: 2, featured: true },
    })
    await articles.create({
      id: 'f2',
      status: 'published',
      values: { title: 'Beta', summary: 'about filters', rating: 10, featured: false },
    })
    await articles.create({
      id: 'f3',
      status: 'published',
      values: { title: 'Gamma', rating: 9, featured: false },
    })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  async function ids(
    query: Readonly<Record<string, string | readonly string[]>>,
  ): Promise<string[]> {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { sort: 'id:asc', ...query } }),
      asPublic,
    )
    expect(response.status).toBe(200)
    return idsOf(response)
  }

  it('matches an exact value with eq', async () => {
    expect(await ids({ 'filter.title.eq': 'Beta' })).toEqual(['f2'])
  })

  it('excludes an exact value with ne', async () => {
    expect(await ids({ 'filter.title.ne': 'Beta' })).toEqual(['f1', 'f3'])
  })

  it('compares numbers numerically rather than as text with lt and gt', async () => {
    // The trap the coercion exists for: as text, "10" < "2".
    expect(await ids({ 'filter.rating.lt': '9' })).toEqual(['f1'])
    expect(await ids({ 'filter.rating.gt': '9' })).toEqual(['f2'])
  })

  it('includes the boundary with lte and gte', async () => {
    expect(await ids({ 'filter.rating.lte': '9' })).toEqual(['f1', 'f3'])
    expect(await ids({ 'filter.rating.gte': '9' })).toEqual(['f2', 'f3'])
  })

  it('matches any of a list with in', async () => {
    expect(await ids({ 'filter.title.in': 'Alpha,Gamma' })).toEqual(['f1', 'f3'])
  })

  it('matches a substring of a text field with contains', async () => {
    expect(await ids({ 'filter.summary.contains': 'filters' })).toEqual(['f2'])
  })

  it('matches a member of a to-many relation with contains', async () => {
    await harness.store(TAG).create({ id: 'tag-a', status: 'published', values: { title: 'A' } })
    await harness.store(ARTICLE).create({
      id: 'f4',
      status: 'published',
      values: { title: 'Delta', tags: ['tag-a'] },
    })

    expect(await ids({ 'filter.tags.contains': 'tag-a' })).toEqual(['f4'])
    expect(await ids({ 'filter.tags.contains': 'tag-b' })).toEqual([])
  })

  it('separates a set field from an absent one with exists', async () => {
    expect(await ids({ 'filter.summary.exists': 'true' })).toEqual(['f1', 'f2'])
    expect(await ids({ 'filter.summary.exists': 'false' })).toEqual(['f3'])
  })

  it('combines repeated conditions with and', async () => {
    expect(await ids({ 'filter.rating.gte': '2', 'filter.featured.eq': 'false' })).toEqual([
      'f2',
      'f3',
    ])
  })

  it('combines the conditions of an any group with or', async () => {
    expect(await ids({ 'filter.any.title.eq': ['Alpha', 'Gamma'] })).toEqual(['f1', 'f3'])
  })

  it('ands the plain conditions with the or group', async () => {
    expect(
      await ids({ 'filter.featured.eq': 'false', 'filter.any.title.eq': ['Alpha', 'Gamma'] }),
    ).toEqual(['f3'])
  })

  it('filters on a system field as well as on a declared one', async () => {
    expect(await ids({ 'filter.status.eq': 'published' })).toEqual(['f1', 'f2', 'f3'])
    expect(await ids({ 'filter.locale.eq': 'fr' })).toEqual([])
  })

  it('names the faulty parameter when a filter uses an unknown field', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { 'filter.nosuchfield.eq': 'secret-value' } }),
      asPublic,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('QUERY_INVALID')
    expect(errorOf(response).message).toContain('filter.nosuchfield.eq')
    // The parameter is named; its value never is.
    expect(JSON.stringify(response.body)).not.toContain('secret-value')
  })

  it('names the faulty parameter when a filter uses an operator the vocabulary has not', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { 'filter.title.regex': '^A' } }),
      asPublic,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).message).toContain('filter.title.regex')
    expect(errorOf(response).hint).toContain('contains')
  })

  it('names the faulty parameter when a filter is not an expression at all', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { 'filter.title': 'Beta' } }),
      asPublic,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).message).toContain('filter.title')
  })

  it('refuses a number comparison against something that is not a number', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_article', { query: { 'filter.rating.gt': 'many' } }),
      asPublic,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).message).toContain('filter.rating.gt')
    expect(JSON.stringify(response.body)).not.toContain('many')
  })
})
