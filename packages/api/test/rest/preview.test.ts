import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PREVIEW_SIGNING_KEY_ENV } from '../../src/access/index.js'
import {
  asEditor,
  asPublic,
  asViewer,
  createHarness,
  dataOf,
  errorOf,
  type Harness,
  request,
} from './harness.js'

const KEY = 'p'.repeat(64)

describe('preview links', () => {
  let harness: Harness
  const saved = process.env[PREVIEW_SIGNING_KEY_ENV]

  beforeEach(async () => {
    process.env[PREVIEW_SIGNING_KEY_ENV] = KEY
    harness = await createHarness({ siteUrl: 'https://example.com' })
  })

  afterEach(async () => {
    if (saved === undefined) delete process.env[PREVIEW_SIGNING_KEY_ENV]
    else process.env[PREVIEW_SIGNING_KEY_ENV] = saved
    await harness.dispose()
  })

  it('mints a token, path and absolute url for a draft only its author-role can read', async () => {
    const created = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Draft page', slug: 'draft-page' } },
      }),
      asEditor,
    )
    const id = dataOf(created)['id'] as string

    const minted = await harness.router.handle(
      request('POST', `/rest_page/${id}/preview`),
      asEditor,
    )
    expect(minted.status).toBe(201)
    const body = dataOf(minted)
    expect(typeof body['token']).toBe('string')
    expect(body['path']).toBe('/blog/draft-page')
    expect(body['url']).toBe(
      `https://example.com/blog/draft-page?state=working&preview=${encodeURIComponent(body['token'] as string)}`,
    )
  })

  it('refuses to mint a link for someone who cannot read the working state', async () => {
    const created = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Draft page', slug: 'draft-page' } },
      }),
      asEditor,
    )
    const id = dataOf(created)['id'] as string

    const refused = await harness.router.handle(
      request('POST', `/rest_page/${id}/preview`),
      asPublic,
    )
    expect(refused.status).toBe(403)
  })

  it('returns null for path/url when the collection has no route', async () => {
    const created = await harness.router.handle(
      request('POST', '/rest_article', { body: { values: { title: 'An article' } } }),
      asEditor,
    )
    const id = dataOf(created)['id'] as string

    const minted = await harness.router.handle(
      request('POST', `/rest_article/${id}/preview`),
      asEditor,
    )
    expect(minted.status).toBe(201)
    expect(dataOf(minted)['path']).toBeNull()
    expect(dataOf(minted)['url']).toBeNull()
  })

  it('unlocks the working state of exactly the entry the token names, for an anonymous reader', async () => {
    const created = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Draft page', slug: 'draft-page' } },
      }),
      asEditor,
    )
    const id = dataOf(created)['id'] as string

    const minted = await harness.router.handle(
      request('POST', `/rest_page/${id}/preview`),
      asEditor,
    )
    const token = dataOf(minted)['token'] as string

    const asAnonymous = await harness.router.handle(
      request('GET', `/rest_page/${id}`, { query: { state: 'working', preview: token } }),
      asPublic,
    )
    expect(asAnonymous.status).toBe(200)
    expect(dataOf(asAnonymous)['id']).toBe(id)

    // Without the token, asking for the working state at all is refused
    // outright — a public actor has no working-state rights whatsoever,
    // preview grant or not.
    const withoutToken = await harness.router.handle(
      request('GET', `/rest_page/${id}`, { query: { state: 'working' } }),
      asPublic,
    )
    expect(withoutToken.status).toBe(403)
  })

  it('unlocks the draft through the by-path engine route too', async () => {
    const created = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Draft page', slug: 'draft-page' } },
      }),
      asEditor,
    )
    const id = dataOf(created)['id'] as string

    const minted = await harness.router.handle(
      request('POST', `/rest_page/${id}/preview`),
      asEditor,
    )
    const token = dataOf(minted)['token'] as string

    const resolved = await harness.router.handle(
      {
        method: 'GET',
        path: '/api/content/-/by-path',
        query: { path: '/blog/draft-page', state: 'working', preview: token },
      },
      asPublic,
    )
    expect(resolved.status).toBe(200)
    expect(dataOf(resolved)['id']).toBe(id)
  })

  it('never covers another entry, even with a valid signature', async () => {
    const first = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'First page', slug: 'first-page' } },
      }),
      asEditor,
    )
    const second = await harness.router.handle(
      request('POST', '/rest_page', {
        body: { values: { title: 'Second page', slug: 'second-page' } },
      }),
      asEditor,
    )
    const secondId = dataOf(second)['id'] as string

    const minted = await harness.router.handle(
      request('POST', `/rest_page/${dataOf(first)['id']}/preview`),
      asEditor,
    )
    const token = dataOf(minted)['token'] as string

    const response = await harness.router.handle(
      request('GET', `/rest_page/${secondId}`, { query: { state: 'working', preview: token } }),
      asPublic,
    )
    expect(response.status).toBe(404)
  })

  it('rejects a malformed preview token instead of silently ignoring it', async () => {
    const response = await harness.router.handle(
      request('GET', '/rest_page/whatever-id', {
        query: { state: 'working', preview: 'not-a-real-token' },
      }),
      asPublic,
    )
    expect(response.status).toBe(403)
    expect(errorOf(response).code).toBe('PREVIEW_TOKEN_INVALID')
  })

  it('does not need the signing key at all for an ordinary read with no preview param', async () => {
    delete process.env[PREVIEW_SIGNING_KEY_ENV]
    const response = await harness.router.handle(request('GET', '/rest_page'), asViewer)
    expect(response.status).toBe(200)
  })
})
