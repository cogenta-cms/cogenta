import type { DatabaseHandle } from '@cogenta/core'
import {
  createContentStore,
  createSchemaTables,
  defineCollection,
  dropSchemaTables,
  f,
} from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { createPermissionLayer } from '../../src/access/permissions.js'
import { createContentService } from '../../src/rest/content-service.js'
import { createRestRouter } from '../../src/rest/router.js'
import type { AccessContext } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'

const item = defineCollection({
  name: 'qa_list_item',
  labels: { singular: 'Item', plural: 'Items' },
  fields: { title: f.text(), publishedAt: f.datetime(), rating: f.number() },
  permissions: { read: ['public'] },
})
const page = defineCollection({
  name: 'qa_list_page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: { title: f.text(), body: f.blocks() },
  versioning: { drafts: true, history: true },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], publish: ['editor'] },
})
const collections = [item, page]
const editor: AccessContext = { actor: { id: 'editor-test', roles: ['editor'] } }
const blocks = (field: string) => ({
  body: [
    {
      key: 'list',
      type: 'collectionList',
      data: { collection: item.name, layout: 'list', sort: { field, direction: 'asc' } },
    },
  ],
})

export function runCollectionListValidationContract(
  label: string,
  open: () => Promise<DatabaseHandle>,
): void {
  describe(`collection list persistence — ${label}`, () => {
    it('rejects invalid create, edit, publish, duplicate and restore before changing persisted content', async () => {
      const db = await open()
      try {
        await dropSchemaTables(db, collections)
        await createSchemaTables(db, collections)
        const store = createContentStore({ db, collection: page })
        const service = createContentService({
          collections,
          permissions: createPermissionLayer({ collections }),
          storeFor: () => store,
        })
        const router = createRestRouter({ service })
        const send = (method: string, path: string, body: unknown, context = editor) =>
          router.handle(
            { method, path: `/api/content/${page.name}${path}`, body, query: {} },
            context,
          )
        const invalid = blocks('title')
        const valid = blocks('publishedAt')
        expect(await send('POST', '', { values: { title: 'New' }, blocks: invalid })).toMatchObject(
          { status: 400, body: { error: { code: 'BLOCK_INVALID' } } },
        )
        expect((await store.list({ state: 'working' })).items).toHaveLength(0)
        const created = await store.create({ values: { title: 'Current' }, blocks: valid })
        const beforeEdit = await store.read(created.id, { state: 'working' })
        expect((await send('PATCH', `/${created.id}`, { blocks: invalid })).status).toBe(400)
        expect(await store.read(created.id, { state: 'working' })).toEqual(beforeEdit)
        const legacy = await store.create({ values: { title: 'Legacy' }, blocks: invalid })
        expect((await send('POST', `/${legacy.id}/publish`, {})).status).toBe(400)
        expect((await send('POST', `/${legacy.id}/duplicate`, {})).status).toBe(400)
        expect((await store.list({ state: 'working' })).items).toHaveLength(2)
        expect(await store.read(legacy.id, { state: 'published' })).toBeNull()
        await store.update(legacy.id, { blocks: valid })
        const corrected = await store.read(legacy.id, { state: 'working' })
        const history = await store.history(legacy.id)
        expect(
          (await send('POST', `/${legacy.id}/restore`, { version: legacy.version })).status,
        ).toBe(400)
        expect(await store.read(legacy.id, { state: 'working' })).toEqual(corrected)
        expect(await store.history(legacy.id)).toEqual(history)
        // System createdAt and an explicitly declared publishedAt are both accepted.
        for (const field of ['createdAt', 'publishedAt']) {
          expect(
            (await send('POST', '', { values: { title: `Valid ${field}` }, blocks: blocks(field) }))
              .status,
          ).toBe(201)
        }
      } finally {
        await dropSchemaTables(db, collections)
        await db.close()
      }
    })

    it('keeps create and publish permission gates ahead of schema diagnostics for every role', async () => {
      const db = await open()
      try {
        await dropSchemaTables(db, collections)
        await createSchemaTables(db, collections)
        const store = createContentStore({ db, collection: page })
        const router = createRestRouter({
          service: createContentService({
            collections,
            permissions: createPermissionLayer({ collections }),
            storeFor: () => store,
          }),
        })
        const legacy = await store.create({ values: { title: 'Legacy' }, blocks: blocks('title') })
        for (const actor of [
          ANONYMOUS,
          { id: 'viewer-test', roles: ['viewer'] },
          { id: 'author-test', roles: ['author'] },
        ]) {
          const context = { actor }
          expect(
            (
              await router.handle(
                {
                  method: 'POST',
                  path: `/api/content/${page.name}`,
                  query: {},
                  body: { values: { title: 'Private' }, blocks: blocks('title') },
                },
                context,
              )
            ).status,
          ).toBe(403)
          expect(
            (
              await router.handle(
                {
                  method: 'POST',
                  path: `/api/content/${page.name}/${legacy.id}/publish`,
                  query: {},
                  body: {},
                },
                context,
              )
            ).status,
          ).toBe(403)
        }
        expect((await store.list({ state: 'working' })).items).toHaveLength(1)
        expect(await store.read(legacy.id, { state: 'published' })).toBeNull()
      } finally {
        await dropSchemaTables(db, collections)
        await db.close()
      }
    })
  })
}
