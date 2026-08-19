import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  createRedirectPatternStore,
  createRedirectStore,
  type RedirectPatternStore,
  type RedirectStore,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createRedirectRouter, type RedirectRouter } from '../../src/rest/redirect-router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * The redirect transport, against a real SQLite database — never a mock
 * (AGENTS.md).
 *
 * Two things this suite exists to prove: every method is admin-only
 * (including `GET` — a redirect table is a routing decision, not content),
 * and the store's own loop/self-redirect refusal reaches a caller as a
 * proper HTTP error rather than a 500.
 */

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }

const asAdmin: AccessContext = { actor: ADMIN }
const asEditor: AccessContext = { actor: EDITOR }
const asPublic: AccessContext = { actor: ANONYMOUS }

interface Redirect {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly status: number
}

function request(
  method: string,
  extra: {
    readonly path?: string
    readonly query?: RestRequest['query']
    readonly body?: unknown
  } = {},
): RestRequest {
  return {
    method,
    path: extra.path ?? '/api/redirects',
    query: extra.query ?? {},
    ...(extra.body === undefined ? {} : { body: extra.body }),
  }
}

function dataOf<T>(response: RestResponse): T {
  return (response.body as { data: T }).data
}

function errorOf(response: RestResponse): { readonly code: string } {
  return (response.body as { error: { code: string } }).error
}

describe('the redirect transport', () => {
  let db: DatabaseHandle
  let directory: string
  let router: RedirectRouter
  let store: RedirectStore
  let patterns: RedirectPatternStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-redirect-api-'))
    db = await createSqliteHandle({ url: join(directory, 'redirects.db') })
    store = createRedirectStore({ db })
    patterns = createRedirectPatternStore({ db })
    router = createRedirectRouter({ store, patterns })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  describe('permissions', () => {
    it('refuses an anonymous read', async () => {
      const response = await router.handle(request('GET'), asPublic)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor — this route is admin-only, unlike a menu or a taxonomy', async () => {
      const response = await router.handle(request('GET'), asEditor)
      expect(response.status).toBe(403)
      expect(errorOf(response).code).toBe('FORBIDDEN')
    })

    it('refuses an editor trying to create one', async () => {
      const response = await router.handle(
        request('POST', { body: { from: '/old', to: '/new' } }),
        asEditor,
      )
      expect(response.status).toBe(403)
    })
  })

  describe('as an admin', () => {
    it('creates a redirect and lists it back', async () => {
      const created = await router.handle(
        request('POST', { body: { from: '/old-page', to: '/new-page' } }),
        asAdmin,
      )
      expect(created.status).toBe(201)
      const record = dataOf<Redirect>(created)
      expect(record.from).toBe('/old-page')
      expect(record.to).toBe('/new-page')
      expect(record.status).toBe(301)

      const listed = await router.handle(request('GET'), asAdmin)
      expect(listed.status).toBe(200)
      expect(dataOf<Redirect[]>(listed)).toHaveLength(1)
    })

    it('accepts an explicit 302 and reason', async () => {
      const created = await router.handle(
        request('POST', {
          body: { from: '/temp', to: '/elsewhere', status: 302, reason: 'manual' },
        }),
        asAdmin,
      )
      expect(created.status).toBe(201)
      expect(dataOf<Redirect>(created).status).toBe(302)
    })

    it('refuses a redirect to itself, as a 409 not a 500', async () => {
      const response = await router.handle(
        request('POST', { body: { from: '/same', to: '/same' } }),
        asAdmin,
      )
      expect(response.status).toBe(409)
      expect(errorOf(response).code).toBe('CONTENT_REDIRECT_LOOP')
    })

    it('refuses a loop across two rows, as a 409', async () => {
      await router.handle(request('POST', { body: { from: '/a', to: '/b' } }), asAdmin)
      const response = await router.handle(
        request('POST', { body: { from: '/b', to: '/a' } }),
        asAdmin,
      )
      expect(response.status).toBe(409)
      expect(errorOf(response).code).toBe('CONTENT_REDIRECT_LOOP')
    })

    it('rejects a body missing "to"', async () => {
      const response = await router.handle(request('POST', { body: { from: '/old' } }), asAdmin)
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('CONTENT_ROUTE_INVALID')
    })

    it('removes a redirect by its "from" query parameter', async () => {
      await router.handle(request('POST', { body: { from: '/gone', to: '/here' } }), asAdmin)

      const removed = await router.handle(request('DELETE', { query: { from: '/gone' } }), asAdmin)
      expect(removed.status).toBe(204)

      const listed = await router.handle(request('GET'), asAdmin)
      expect(dataOf<Redirect[]>(listed)).toHaveLength(0)
    })

    it('answers 404 removing a redirect that does not exist', async () => {
      const response = await router.handle(
        request('DELETE', { query: { from: '/never-existed' } }),
        asAdmin,
      )
      expect(response.status).toBe(404)
      expect(errorOf(response).code).toBe('REDIRECT_UNKNOWN')
    })

    it('requires "from" on delete', async () => {
      const response = await router.handle(request('DELETE'), asAdmin)
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('QUERY_INVALID')
    })
  })

  describe('PATCH — editing a rule without a 404 gap (fiche 12 task 2)', () => {
    it('changes the target and status of an existing rule', async () => {
      await router.handle(request('POST', { body: { from: '/old', to: '/first' } }), asAdmin)

      const updated = await router.handle(
        request('PATCH', { query: { from: '/old' }, body: { to: '/second', status: 302 } }),
        asAdmin,
      )
      expect(updated.status).toBe(200)
      expect(dataOf<Redirect>(updated)).toMatchObject({ from: '/old', to: '/second', status: 302 })
    })

    it('is admin-only, like every other method here', async () => {
      const response = await router.handle(
        request('PATCH', { query: { from: '/old' }, body: { to: '/new' } }),
        asEditor,
      )
      expect(response.status).toBe(403)
    })

    it('requires "from"', async () => {
      const response = await router.handle(request('PATCH', { body: { to: '/new' } }), asAdmin)
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('QUERY_INVALID')
    })

    it('404s editing a rule that does not exist', async () => {
      const response = await router.handle(
        request('PATCH', { query: { from: '/nowhere' }, body: { to: '/somewhere' } }),
        asAdmin,
      )
      expect(response.status).toBe(404)
      expect(errorOf(response).code).toBe('REDIRECT_UNKNOWN')
    })
  })

  describe('301/302/307/308/410 (fiche 12 task 4)', () => {
    it('creates a 410 with no "to"', async () => {
      const created = await router.handle(
        request('POST', { body: { from: '/discontinued', status: 410 } }),
        asAdmin,
      )
      expect(created.status).toBe(201)
      expect(dataOf<Redirect>(created)).toMatchObject({ from: '/discontinued', status: 410 })
    })

    it('accepts 307 and 308', async () => {
      const permanent = await router.handle(
        request('POST', { body: { from: '/a', to: '/b', status: 308 } }),
        asAdmin,
      )
      expect(dataOf<Redirect>(permanent).status).toBe(308)

      const temporary = await router.handle(
        request('POST', { body: { from: '/c', to: '/d', status: 307 } }),
        asAdmin,
      )
      expect(dataOf<Redirect>(temporary).status).toBe(307)
    })

    it('refuses an unknown status code', async () => {
      const response = await router.handle(
        request('POST', { body: { from: '/x', to: '/y', status: 200 } }),
        asAdmin,
      )
      expect(response.status).toBe(400)
      expect(errorOf(response).code).toBe('CONTENT_ROUTE_INVALID')
    })
  })

  describe('search and pagination on GET (fiche 12 task 2)', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i += 1) {
        await router.handle(
          request('POST', { body: { from: `/blog-post-${i}`, to: `/actualites/post-${i}` } }),
          asAdmin,
        )
      }
      await router.handle(request('POST', { body: { from: '/unrelated', to: '/other' } }), asAdmin)
    })

    it('searches "from" and "to" by substring', async () => {
      const response = await router.handle(request('GET', { query: { q: 'blog-post' } }), asAdmin)
      expect(response.status).toBe(200)
      const rows = dataOf<Redirect[]>(response)
      expect(rows).toHaveLength(5)
      expect(rows.every((row) => row.from.includes('blog-post'))).toBe(true)
    })

    it('finds a row by a substring of its target too', async () => {
      const response = await router.handle(request('GET', { query: { q: 'actualites' } }), asAdmin)
      expect(dataOf<Redirect[]>(response)).toHaveLength(5)
    })

    it('paginates with limit and offset, and reports the true total', async () => {
      const firstPage = await router.handle(
        request('GET', { query: { limit: '2', offset: '0' } }),
        asAdmin,
      )
      const body = firstPage.body as { readonly data: readonly Redirect[]; readonly total: number }
      expect(body.data).toHaveLength(2)
      expect(body.total).toBe(6)

      const secondPage = await router.handle(
        request('GET', { query: { limit: '2', offset: '2' } }),
        asAdmin,
      )
      const secondBody = (secondPage.body as { readonly data: readonly Redirect[] }).data
      expect(secondBody).toHaveLength(2)
      expect(secondBody.map((row) => row.from)).not.toEqual(
        (body.data as readonly Redirect[]).map((row) => row.from),
      )
    })
  })

  describe('/api/redirects/patterns — prefix redirects (fiche 12 task 4)', () => {
    it('creates, lists and removes a prefix rule', async () => {
      const created = await router.handle(
        request('POST', {
          path: '/api/redirects/patterns',
          body: { fromPrefix: '/blog/*', toPrefix: '/actualites/*' },
        }),
        asAdmin,
      )
      expect(created.status).toBe(201)

      const listed = await router.handle(
        request('GET', { path: '/api/redirects/patterns' }),
        asAdmin,
      )
      expect(dataOf<{ fromPrefix: string }[]>(listed)).toHaveLength(1)

      const removed = await router.handle(
        request('DELETE', { path: '/api/redirects/patterns', query: { fromPrefix: '/blog/*' } }),
        asAdmin,
      )
      expect(removed.status).toBe(204)
    })

    it('is admin-only', async () => {
      const response = await router.handle(
        request('GET', { path: '/api/redirects/patterns' }),
        asPublic,
      )
      expect(response.status).toBe(403)
    })

    it('never accepts a regular expression as a pattern — it is always a plain prefix', async () => {
      // There is no field this route reads as a regex at all: `fromPrefix`
      // and `toPrefix` are matched with `startsWith`, never `new RegExp`.
      // Sending something that *looks* like a catastrophic-backtracking
      // pattern is accepted as a perfectly ordinary, harmless literal prefix.
      const created = await router.handle(
        request('POST', {
          path: '/api/redirects/patterns',
          body: { fromPrefix: '/(a+)+$/*', toPrefix: '/safe/*' },
        }),
        asAdmin,
      )
      expect(created.status).toBe(201)
    })

    it('404s when the router has no pattern store configured', async () => {
      const withoutPatterns = createRedirectRouter({ store })
      const response = await withoutPatterns.handle(
        request('GET', { path: '/api/redirects/patterns' }),
        asAdmin,
      )
      expect(response.status).toBe(404)
    })
  })

  describe('/api/redirects/export and /import — CSV (fiche 12 task 4)', () => {
    it('exports every redirect as CSV', async () => {
      await router.handle(request('POST', { body: { from: '/old', to: '/new' } }), asAdmin)

      const response = await router.handle(
        request('GET', { path: '/api/redirects/export' }),
        asAdmin,
      )
      expect(response.status).toBe(200)
      const { csv } = dataOf<{ csv: string }>(response)
      expect(csv).toContain('from,to,status,reason')
      expect(csv).toContain('/old,/new,301,manual')
    })

    it('previews an import without writing anything', async () => {
      const csv = 'from,to,status\n/old-page,/new-page,301\n/discontinued,,410\n'

      const preview = await router.handle(
        request('POST', { path: '/api/redirects/import', body: { csv } }),
        asAdmin,
      )
      expect(preview.status).toBe(200)
      const body = dataOf<{
        readonly rows: readonly { readonly outcome: string }[]
        readonly summary: Record<string, number>
      }>(preview)
      expect(body.summary.create).toBe(2)

      const listed = await router.handle(request('GET'), asAdmin)
      expect(dataOf<Redirect[]>(listed)).toHaveLength(0)
    })

    it('shows a conflict against an existing rule before applying', async () => {
      await router.handle(request('POST', { body: { from: '/old', to: '/first-target' } }), asAdmin)

      const csv = 'from,to,status\n/old,/second-target,301\n'
      const preview = await router.handle(
        request('POST', { path: '/api/redirects/import', body: { csv } }),
        asAdmin,
      )
      const body = dataOf<{ readonly rows: readonly { readonly outcome: string }[] }>(preview)
      expect(body.rows[0]?.outcome).toBe('update')
    })

    it('flags a self-redirecting row as a loop, and a repeated "from" as a duplicate', async () => {
      const csv = 'from,to,status\n/a,/a,301\n/b,/x,301\n/b,/y,301\n'
      const preview = await router.handle(
        request('POST', { path: '/api/redirects/import', body: { csv } }),
        asAdmin,
      )
      const body = dataOf<{
        readonly rows: readonly { readonly from: string; readonly outcome: string }[]
      }>(preview)
      expect(body.rows.find((row) => row.from === '/a')?.outcome).toBe('loop')
      expect(body.rows.filter((row) => row.from === '/b').map((row) => row.outcome)).toEqual([
        'duplicate',
        'create',
      ])
    })

    it('actually writes the rows once apply is true', async () => {
      const csv = 'from,to,status\n/imported-one,/target-one,301\n/imported-two,/target-two,302\n'

      const applied = await router.handle(
        request('POST', { path: '/api/redirects/import', body: { csv, apply: true } }),
        asAdmin,
      )
      expect(applied.status).toBe(200)
      const body = dataOf<{ readonly created: number; readonly updated: number }>(applied)
      expect(body.created).toBe(2)

      const listed = await router.handle(request('GET'), asAdmin)
      expect(dataOf<Redirect[]>(listed)).toHaveLength(2)
    })

    it('reports a malformed header rather than guessing', async () => {
      const response = await router.handle(
        request('POST', { path: '/api/redirects/import', body: { csv: 'a,b,c\n1,2,3\n' } }),
        asAdmin,
      )
      const body = dataOf<{ readonly issues: readonly { readonly detail: string }[] }>(response)
      expect(body.issues[0]?.detail).toMatch(/from.*to/i)
    })

    it('is admin-only', async () => {
      const response = await router.handle(
        request('POST', { path: '/api/redirects/import', body: { csv: 'from,to\n/a,/b\n' } }),
        asPublic,
      )
      expect(response.status).toBe(403)
    })
  })
})
