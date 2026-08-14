import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  asEditor,
  asPublic,
  createHarness,
  dataOf,
  type Harness,
  listOf,
  request,
} from './harness.js'

describe('GET /{collection}/{id}/translations', () => {
  let harness: Harness

  beforeEach(async () => {
    harness = await createHarness()
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('lists every member of the translation family, in either direction', async () => {
    const source = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Hello', slug: 'hello' }, locale: 'en' },
      }),
      asEditor,
    )
    const sourceId = dataOf(source)['id'] as string

    const translation = await harness.router.handle(
      request('POST', '/rest_page', {
        body: {
          values: { title: 'Bonjour', slug: 'bonjour' },
          locale: 'fr',
          translationOf: sourceId,
        },
      }),
      asEditor,
    )
    const translationId = dataOf(translation)['id'] as string

    const fromSource = await harness.router.handle(
      request('GET', `/rest_page/${sourceId}/translations`),
      asEditor,
    )
    expect(fromSource.status).toBe(200)
    expect(
      listOf(fromSource)
        .map((entry) => entry['locale'])
        .sort(),
    ).toEqual(['en', 'fr'])

    const fromTranslation = await harness.router.handle(
      request('GET', `/rest_page/${translationId}/translations`),
      asEditor,
    )
    expect(
      listOf(fromTranslation)
        .map((entry) => entry['id'])
        .sort(),
    ).toEqual([sourceId, translationId].sort())
  })

  it('refuses a public actor outright, the same gate as history', async () => {
    const source = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Hello', slug: 'hello' }, locale: 'en' },
      }),
      asEditor,
    )
    const sourceId = dataOf(source)['id'] as string

    const response = await harness.router.handle(
      request('GET', `/rest_page/${sourceId}/translations`),
      asPublic,
    )
    expect(response.status).toBe(403)
  })

  it('never crosses into an unrelated entry sharing no family', async () => {
    const first = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'First', slug: 'first' }, locale: 'en' },
      }),
      asEditor,
    )
    const second = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Second', slug: 'second' }, locale: 'en' },
      }),
      asEditor,
    )

    const response = await harness.router.handle(
      request('GET', `/rest_page/${dataOf(first)['id']}/translations`),
      asEditor,
    )
    expect(listOf(response).map((entry) => entry['id'])).toEqual([dataOf(first)['id']])
    expect(listOf(response).map((entry) => entry['id'])).not.toContain(dataOf(second)['id'])
  })
})
