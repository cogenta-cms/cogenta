import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
import {
  asEditor,
  asPublic,
  bodyOf,
  createHarness,
  dataOf,
  errorOf,
  GUIDE,
  type Harness,
  MEMO,
  PAGE,
  request,
  valuesOf,
} from './harness.js'

/**
 * `/-/by-path` is the renderer's only way in: it holds a URL and nothing else.
 *
 * Two properties are what this file is here for. The route answers all three
 * outcomes — entry, redirect, nothing — because a renderer that only learns
 * "entry or nothing" cannot serve the 301 a rename created, and every old link
 * dies at the next rename. And it goes through the *same* access layer as every
 * other read, so a URL is not a second door into a draft.
 */
describe('resolving a site URL', () => {
  let harness: Harness

  const byPath = (
    path: string,
    context: AccessContext,
    query: Readonly<Record<string, string>> = {},
  ) => harness.router.handle(request('GET', '/-/by-path', { query: { path, ...query } }), context)

  const redirectOf = (
    response: Awaited<ReturnType<Harness['router']['handle']>>,
  ): Record<string, unknown> => {
    const redirect = bodyOf(response)['redirect']
    return typeof redirect === 'object' && redirect !== null
      ? (redirect as Record<string, unknown>)
      : {}
  }

  beforeEach(async () => {
    harness = await createHarness()

    const pages = harness.store(PAGE)
    await pages.create({
      id: 'page-live',
      status: 'published',
      values: { slug: 'hello', title: 'Hello' },
    })
    await pages.create({ id: 'page-draft', values: { slug: 'secret', title: 'Secret' } })

    const guides = harness.store(GUIDE)
    await guides.create({
      id: 'guide-en',
      status: 'published',
      locale: 'en',
      values: { slug: 'start', title: 'Getting started' },
    })
    await guides.create({
      id: 'guide-fr',
      status: 'published',
      locale: 'fr',
      values: { slug: 'demarrer', title: 'Pour démarrer' },
    })

    await harness.store(MEMO).create({
      id: 'memo-live',
      status: 'published',
      values: { slug: 'internal', title: 'Internal' },
    })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('resolves a published path to its entry and the route it matched', async () => {
    const response = await byPath('/blog/hello', asPublic)

    expect(response.status).toBe(200)
    expect(dataOf(response)['id']).toBe('page-live')
    expect(valuesOf(dataOf(response))['title']).toBe('Hello')
    expect(bodyOf(response)['route']).toEqual({
      collection: 'rest_page',
      locale: null,
      params: { slug: 'hello' },
    })
  })

  it('ignores a trailing slash and a query string on the path', async () => {
    const response = await byPath('/blog/hello/?utm_source=newsletter', asPublic)

    expect(dataOf(response)['id']).toBe('page-live')
  })

  it('answers 404 when nothing is served at the path', async () => {
    const response = await byPath('/blog/nowhere', asPublic)

    expect(response.status).toBe(404)
    expect(errorOf(response).code).toBe('CONTENT_NOT_FOUND')
  })

  // ------------------------------------------------------------------ drafts

  it('never resolves a URL to a draft for an anonymous caller', async () => {
    const response = await byPath('/blog/secret', asPublic)

    expect(response.status).toBe(404)
  })

  it('refuses an anonymous caller that asks this route for the working state', async () => {
    const response = await byPath('/blog/secret', asPublic, { state: 'working' })

    expect(response.status).toBe(403)
    expect(errorOf(response).code).toBe('FORBIDDEN')
  })

  it('resolves a draft URL for an authoring role that asks for the working state', async () => {
    const response = await byPath('/blog/secret', asEditor, { state: 'working' })

    expect(response.status).toBe(200)
    expect(dataOf(response)['id']).toBe('page-draft')
  })

  it('serves the published values of an entry that has a pending edit', async () => {
    await harness.store(PAGE).update('page-live', { values: { title: 'Hello, revised' } })

    const response = await byPath('/blog/hello', asPublic)

    expect(valuesOf(dataOf(response))['title']).toBe('Hello')
  })

  it('lets a preview grant resolve the URL of its own entry and of no other', async () => {
    const grant: AccessContext = {
      actor: ANONYMOUS,
      preview: { collection: 'rest_page', entryId: 'page-draft', expiresAt: Date.now() + 60_000 },
    }

    const own = await byPath('/blog/secret', grant, { state: 'working' })
    expect(own.status).toBe(200)
    expect(dataOf(own)['id']).toBe('page-draft')

    // The working face of a published entry is its pending draft, and a token
    // for one entry must not open it for another.
    await harness.store(PAGE).update('page-live', { values: { title: 'Hello, revised' } })
    const other = await byPath('/blog/hello', grant, { state: 'working' })
    expect(other.status).toBe(404)
  })

  it('does not resolve a URL of a collection the caller may not read', async () => {
    const stranger = await byPath('/memo/internal', asPublic)
    expect(stranger.status).toBe(404)

    const editor = await byPath('/memo/internal', asEditor)
    expect(editor.status).toBe(200)
    expect(dataOf(editor)['id']).toBe('memo-live')
  })

  // --------------------------------------------------------------- redirects

  it('answers a moved path with its target and its status, not with a 404', async () => {
    await harness.redirects.add({
      from: '/blog/old-name',
      to: '/blog/hello',
      reason: 'slug-change',
    })

    const response = await byPath('/blog/old-name', asPublic)

    expect(response.status).toBe(200)
    expect(bodyOf(response)['data']).toBeNull()
    expect(redirectOf(response)).toEqual({ to: '/blog/hello', status: 301 })
  })

  it('keeps a temporary redirect temporary', async () => {
    await harness.redirects.add({ from: '/blog/campaign', to: '/blog/hello', status: 302 })

    expect(redirectOf(await byPath('/blog/campaign', asPublic))['status']).toBe(302)
  })

  it('prefers live content over a stale redirect leaving the same path', async () => {
    await harness.redirects.add({ from: '/blog/hello', to: '/blog/elsewhere' })

    const response = await byPath('/blog/hello', asPublic)

    expect(response.status).toBe(200)
    expect(dataOf(response)['id']).toBe('page-live')
  })

  it('redirects rather than leaking that the path a draft will occupy is taken', async () => {
    await harness.redirects.add({ from: '/blog/secret', to: '/blog/hello' })

    const response = await byPath('/blog/secret', asPublic)

    expect(redirectOf(response)['to']).toBe('/blog/hello')
  })

  // ----------------------------------------------------------------- locales

  it('reads the locale from the prefix of a localised route', async () => {
    const french = await byPath('/fr/guide/demarrer', asPublic)

    expect(french.status).toBe(200)
    expect(dataOf(french)['id']).toBe('guide-fr')
    expect(bodyOf(french)['route']).toEqual({
      collection: 'rest_guide',
      locale: 'fr',
      params: { slug: 'demarrer' },
    })
  })

  it('serves the default locale unprefixed', async () => {
    const response = await byPath('/guide/start', asPublic)

    expect(dataOf(response)['id']).toBe('guide-en')
    expect(bodyOf(response)['route']).toMatchObject({ locale: 'en' })
  })

  it('does not serve one locale under the prefix of another', async () => {
    const response = await byPath('/fr/guide/start', asPublic)

    expect(response.status).toBe(404)
  })

  // ------------------------------------------------------------- the request

  it('names the parameter when the path is missing', async () => {
    const response = await harness.router.handle(request('GET', '/-/by-path'), asPublic)

    expect(response.status).toBe(400)
    expect(errorOf(response).code).toBe('QUERY_INVALID')
    expect(errorOf(response).message).toContain('"path"')
  })

  it('refuses an absolute or protocol-relative URL rather than resolving it', async () => {
    expect((await byPath('https://elsewhere.example/blog/hello', asPublic)).status).toBe(400)
    expect((await byPath('//elsewhere.example/blog/hello', asPublic)).status).toBe(400)
  })

  it('refuses a method other than GET', async () => {
    const response = await harness.router.handle(
      request('POST', '/-/by-path', { query: { path: '/blog/hello' } }),
      asPublic,
    )

    expect(response.status).toBe(405)
  })

  it('does not answer under the reserved segment for anything but a known engine route', async () => {
    expect((await harness.router.handle(request('GET', '/-/whatever'), asPublic)).status).toBe(404)
    expect((await harness.router.handle(request('GET', '/-/by-path/extra'), asPublic)).status).toBe(
      404,
    )
  })
})
