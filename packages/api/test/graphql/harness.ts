import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentEntry,
  type ContentStore,
  createContentStore,
  createSchemaTables,
  defineCollection,
  f,
} from '@cogenta/schema'
import type { GraphQLSchema } from 'graphql'
import { createPermissionLayer } from '../../src/access/index.js'
import {
  buildContentSchema,
  type ContentGateway,
  createContentGateway,
  executeGraphQL,
  type GraphQLResponse,
} from '../../src/graphql/index.js'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

/**
 * A real SQLite database, one per test file.
 *
 * No mock: AGENTS.md forbids one, and a mocked store would hide the two things
 * these tests exist to prove — that the published-only rule is enforced by the
 * storage rather than by a filter someone remembered, and that the dataloader
 * actually collapses the reads.
 */

export const AUTHOR: CollectionDefinition = defineCollection({
  name: 'gql_author',
  labels: { singular: 'Author', plural: 'Authors' },
  fields: {
    name: f.text({ required: true, max: 120 }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
})

export const ARTICLE: CollectionDefinition = defineCollection({
  name: 'gql_article',
  labels: { singular: 'Article', plural: 'Articles' },
  versioning: { drafts: true, history: true, keep: 5 },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title' }),
    views: f.number({ integer: true }),
    featured: f.boolean(),
    body: f.blocks({ allow: ['richText'] }),
    author: f.relation({ to: 'gql_author' }),
    // Self-referencing on purpose: `related` can be followed forever, which is
    // exactly the circular relation the L1 spec warns about. The depth bound is
    // the only thing standing between this schema and an unbounded query.
    related: f.relation({ to: 'gql_article', many: true }),
  },
  permissions: {
    read: ['public'],
    create: ['editor'],
    update: ['editor'],
    delete: ['editor'],
    publish: ['editor'],
  },
})

export const COLLECTIONS = [ARTICLE, AUTHOR]

export const EDITOR: Actor = { id: '018f0000-0000-7000-8000-0000000000ed', roles: ['editor'] }

export function asEditor(): AccessContext {
  return { actor: EDITOR }
}

export function asPublic(): AccessContext {
  return { actor: ANONYMOUS }
}

export interface Harness {
  readonly db: DatabaseHandle
  readonly schema: GraphQLSchema
  readonly gateway: ContentGateway
  readonly stores: ReadonlyMap<string, ContentStore>
  /** How many times a store was asked for a single entry, all collections. */
  reads(): number
  resetReads(): void
  run(
    query: string,
    context: AccessContext,
    variables?: Record<string, unknown>,
  ): Promise<GraphQLResponse>
  dispose(): Promise<void>
}

export async function createHarness(options: { maxDepth?: number } = {}): Promise<Harness> {
  const directory = await mkdtemp(join(tmpdir(), 'cogenta-graphql-'))
  const db = await createSqliteHandle({ url: join(directory, 'api.db') })
  await createSchemaTables(db, COLLECTIONS)

  let reads = 0
  const stores = new Map<string, ContentStore>()
  for (const collection of COLLECTIONS) {
    const store = createContentStore({ db, collection })
    stores.set(
      collection.name,
      counting(store, () => (reads += 1)),
    )
  }

  const gateway = createContentGateway({
    collections: COLLECTIONS,
    stores,
    permissions: createPermissionLayer({ collections: COLLECTIONS }),
  })

  const schema = buildContentSchema({
    collections: COLLECTIONS,
    ...(options.maxDepth === undefined ? {} : { maxDepth: options.maxDepth }),
  })

  return {
    db,
    schema,
    gateway,
    stores,
    reads: () => reads,
    resetReads: () => {
      reads = 0
    },
    run: (query, access, variables) =>
      executeGraphQL(
        { query, ...(variables === undefined ? {} : { variables }) },
        { schema, gateway, access },
      ),
    dispose: async () => {
      await db.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

/** Counts single-entry reads: the number the N+1 test is about. */
function counting(store: ContentStore, tick: () => void): ContentStore {
  return {
    ...store,
    read: (id, readOptions) => {
      tick()
      return store.read(id, readOptions)
    },
  }
}

export function storeOf(harness: Harness, collection: CollectionDefinition): ContentStore {
  const store = harness.stores.get(collection.name)
  if (store === undefined) throw new Error(`no store for ${collection.name}`)
  return store
}

/** Fails loudly rather than letting a `null` field pass as "no error". */
export function dataOf(response: GraphQLResponse): Record<string, unknown> {
  if (response.errors !== undefined) {
    throw new Error(`unexpected GraphQL errors: ${JSON.stringify(response.errors)}`)
  }
  if (response.data === null || response.data === undefined) throw new Error('no data')
  return { ...response.data }
}

export async function publishedArticle(
  harness: Harness,
  values: Record<string, unknown>,
): Promise<ContentEntry> {
  const store = storeOf(harness, ARTICLE)
  const created = await store.create({ values })
  return store.publish(created.id)
}
