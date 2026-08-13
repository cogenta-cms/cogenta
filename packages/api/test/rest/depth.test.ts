import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTICLE,
  AUTHOR,
  asPublic,
  createHarness,
  dataOf,
  errorOf,
  type Harness,
  NODE,
  request,
  valuesOf,
} from './harness.js'

describe('relation expansion', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  async function seedArticle(): Promise<string> {
    await harness.store(AUTHOR).create({
      id: 'author-1',
      status: 'published',
      values: { name: 'Ada' },
    })
    await harness.store(ARTICLE).create({
      id: 'article-1',
      status: 'published',
      values: { title: 'With an author', writer: 'author-1' },
    })
    return 'article-1'
  }

  it('expands a to-one relation into an entry at the default depth', async () => {
    const id = await seedArticle()

    const response = await harness.router.handle(request('GET', `/rest_article/${id}`), asPublic)
    const writer = valuesOf(dataOf(response))['writer']

    expect(typeof writer).toBe('object')
    expect((writer as Record<string, unknown>)['id']).toBe('author-1')
    expect(valuesOf(writer as Record<string, unknown>)['name']).toBe('Ada')
  })

  it('leaves a relation as an identifier when no expansion is asked for', async () => {
    const id = await seedArticle()

    const response = await harness.router.handle(
      request('GET', `/rest_article/${id}`, { query: { depth: '0' } }),
      asPublic,
    )

    expect(valuesOf(dataOf(response))['writer']).toBe('author-1')
  })

  it('names the parameter and states the bound when a request asks to go deeper than allowed', async () => {
    const id = await seedArticle()

    const response = await harness.router.handle(
      request('GET', `/rest_article/${id}`, { query: { depth: '99' } }),
      asPublic,
    )

    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('QUERY_INVALID')
    expect(errorOf(response).message).toContain('"depth"')
    expect(errorOf(response).hint).toContain('circular')
  })

  it('terminates on a cycle instead of expanding it forever', async () => {
    const nodes = harness.store(NODE)
    await nodes.create({ id: 'node-a', status: 'published', values: { label: 'A' } })
    await nodes.create({
      id: 'node-b',
      status: 'published',
      values: { label: 'B', next: 'node-a' },
    })
    await nodes.update('node-a', { values: { next: 'node-b' } })

    const response = await harness.router.handle(
      request('GET', '/rest_node/node-a', { query: { depth: '3' } }),
      asPublic,
    )

    expect(response.status).toBe(200)

    const b = valuesOf(dataOf(response))['next'] as Record<string, unknown>
    expect(b['id']).toBe('node-b')
    // Back at A, the cycle guard hands out the identifier rather than the entry,
    // so the payload is finite whatever the depth budget still allows.
    expect(valuesOf(b)['next']).toBe('node-a')
  })

  it('stops expanding when the depth budget runs out', async () => {
    const nodes = harness.store(NODE)
    await nodes.create({ id: 'n1', status: 'published', values: { label: '1' } })
    await nodes.create({ id: 'n2', status: 'published', values: { label: '2', next: 'n1' } })
    await nodes.create({ id: 'n3', status: 'published', values: { label: '3', next: 'n2' } })

    const response = await harness.router.handle(
      request('GET', '/rest_node/n3', { query: { depth: '1' } }),
      asPublic,
    )

    const second = valuesOf(dataOf(response))['next'] as Record<string, unknown>
    expect(second['id']).toBe('n2')
    expect(valuesOf(second)['next']).toBe('n1')
  })

  it('leaves a relation to an unpublished entry as an identifier for the public', async () => {
    await harness.store(AUTHOR).create({ id: 'author-2', values: { name: 'Draft author' } })
    await harness.store(ARTICLE).create({
      id: 'article-2',
      status: 'published',
      values: { title: 'Points at a draft', writer: 'author-2' },
    })

    const response = await harness.router.handle(
      request('GET', '/rest_article/article-2'),
      asPublic,
    )

    expect(valuesOf(dataOf(response))['writer']).toBe('author-2')
  })
})
