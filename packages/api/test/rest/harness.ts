import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition, ContentStore, RedirectStore } from '@cogenta/schema'
import { createContentStore, createRedirectStore, createSchemaTables } from '@cogenta/schema'
import { createPermissionLayer } from '../../src/access/index.js'
import { createContentService } from '../../src/rest/content-service.js'
import type { RestRequest, RestResponse } from '../../src/rest/http.js'
import { createRestRouter, type RestRouter } from '../../src/rest/router.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * A real SQLite database on disk, never a mock (AGENTS.md), and never a service
 * that has to be started: SQLite is the degraded driver every shared-hosting
 * install falls back to, so it is the one these tests must run on.
 */

export const AUTHOR: CollectionDefinition = {
  name: 'rest_author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: { name: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
}

export const TAG: CollectionDefinition = {
  name: 'rest_tag',
  labels: { singular: 'Tag', plural: 'Tags' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'] },
}

export const ARTICLE: CollectionDefinition = {
  name: 'rest_article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true, history: true, keep: 10 },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    summary: { kind: 'text', options: { max: 500 } },
    rating: { kind: 'number', options: {} },
    featured: { kind: 'boolean', options: {} },
    writer: { kind: 'relation', options: { to: 'rest_author', onDelete: 'setNull' } },
    tags: { kind: 'relation', options: { to: 'rest_tag', many: true } },
    zone: { kind: 'blocks', options: { allow: '*' } },
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['editor'],
  },
}

/** Two collections pointing at each other: the circular case the spec warns about. */
export const NODE: CollectionDefinition = {
  name: 'rest_node',
  labels: { singular: 'Node', plural: 'Nodes' },
  fields: {
    label: { kind: 'text', options: { max: 60 } },
    next: { kind: 'relation', options: { to: 'rest_node', onDelete: 'setNull' } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
}

/** A routed, unlocalised collection: the `/blog/:slug` case. */
export const PAGE: CollectionDefinition = {
  name: 'rest_page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/blog/:slug' },
  versioning: { drafts: true, history: true, keep: 10 },
  fields: {
    slug: { kind: 'slug', options: { from: 'title' } },
    title: { kind: 'text', required: true, options: { max: 200 } },
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['admin'],
    publish: ['editor'],
  },
}

/** The same, behind a locale prefix: `/fr/guide/:slug`. */
export const GUIDE: CollectionDefinition = {
  name: 'rest_guide',
  labels: { singular: 'Guide', plural: 'Guides' },
  routing: { pattern: '/guide/:slug', locale: true },
  fields: {
    slug: { kind: 'slug', options: { from: 'title' } },
    title: { kind: 'text', required: true, options: { max: 200 } },
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
}

/** Routed, but not readable by the public: its URLs must not answer either. */
export const MEMO: CollectionDefinition = {
  name: 'rest_memo',
  labels: { singular: 'Memo', plural: 'Memos' },
  routing: { pattern: '/memo/:slug' },
  fields: {
    slug: { kind: 'slug', options: { from: 'title' } },
    title: { kind: 'text', required: true, options: { max: 200 } },
  },
  permissions: { read: ['editor'], create: ['editor'], update: ['editor'], publish: ['editor'] },
}

export const COLLECTIONS: readonly CollectionDefinition[] = [
  AUTHOR,
  TAG,
  ARTICLE,
  NODE,
  PAGE,
  GUIDE,
  MEMO,
]

/** The site's languages, as the by-path route needs them to read a prefix. */
export const LOCALES = ['en', 'fr'] as const
export const DEFAULT_LOCALE = 'en'

export const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
export const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
export const VIEWER: Actor = { id: 'user-viewer', roles: ['viewer'] }

export const asPublic: AccessContext = { actor: ANONYMOUS }
export const asEditor: AccessContext = { actor: EDITOR }
export const asAdmin: AccessContext = { actor: ADMIN }
export const asViewer: AccessContext = { actor: VIEWER }

export interface Harness {
  readonly db: DatabaseHandle
  readonly router: RestRouter
  readonly redirects: RedirectStore
  store(collection: CollectionDefinition): ContentStore
  dispose(): Promise<void>
}

export async function createHarness(options: { readonly siteUrl?: string } = {}): Promise<Harness> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-rest-'))
  const db = await createSqliteHandle({ url: join(directory, 'rest.db') })
  await createSchemaTables(db, COLLECTIONS)

  const stores = new Map<string, ContentStore>()
  const store = (collection: CollectionDefinition): ContentStore => {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    // `siblings` is what lets `delete()` enforce `restrict` in application
    // code now that trashing is an UPDATE (ADR-0022). The real runtime passes
    // the whole set, so the tests must too.
    const created = createContentStore({ db, collection, siblings: COLLECTIONS })
    stores.set(collection.name, created)
    return created
  }

  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()

  const service = createContentService({
    collections: COLLECTIONS,
    permissions: createPermissionLayer({ collections: COLLECTIONS }),
    storeFor: store,
    routing: { locales: LOCALES, defaultLocale: DEFAULT_LOCALE, redirects },
  })

  return {
    db,
    redirects,
    router: createRestRouter({
      service,
      ...(options.siteUrl === undefined ? {} : { siteUrl: options.siteUrl }),
    }),
    store,
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

type Query = Readonly<Record<string, string | readonly string[] | undefined>>

export function request(
  method: string,
  path: string,
  extra: { readonly query?: Query; readonly body?: unknown } = {},
): RestRequest {
  return {
    method,
    path: `/api/content${path}`,
    query: extra.query ?? {},
    ...(extra.body === undefined ? {} : { body: extra.body }),
  }
}

/** The response body, narrowed to a record so tests can read it without casts. */
export function bodyOf(response: RestResponse): Record<string, unknown> {
  if (typeof response.body !== 'object' || response.body === null) return {}
  return response.body as Record<string, unknown>
}

export function dataOf(response: RestResponse): Record<string, unknown> {
  const data = bodyOf(response)['data']
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
}

export function listOf(response: RestResponse): Record<string, unknown>[] {
  const data = bodyOf(response)['data']
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
}

export function errorOf(response: RestResponse): {
  code?: string
  message?: string
  hint?: string
} {
  const error = bodyOf(response)['error']
  return typeof error === 'object' && error !== null ? error : {}
}

export function idsOf(response: RestResponse): string[] {
  return listOf(response).map((entry) => String(entry['id']))
}

export function valuesOf(entry: Record<string, unknown>): Record<string, unknown> {
  const values = entry['values']
  return typeof values === 'object' && values !== null ? (values as Record<string, unknown>) : {}
}
