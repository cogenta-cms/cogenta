import { ANONYMOUS, createContentGateway, createPermissionLayer } from '@cogenta/api'
import { createSqliteHandle } from '@cogenta/core'
import {
  type ContentStore,
  createContentStore,
  createSchemaTables,
  defineCollection,
  f,
} from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { renderRequestedPage } from '../src/commands/theme-render.js'

const post = defineCollection({
  name: 'listed_post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/posts/:slug' },
  fields: {
    title: f.text(),
    slug: f.slug({ from: 'title' }),
    publishedAt: f.datetime(),
    rating: f.number(),
  },
  permissions: { read: ['public'] },
})
const page = defineCollection({
  name: 'list_page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: { title: f.text(), slug: f.slug({ from: 'title' }), body: f.blocks() },
  permissions: { read: ['public'] },
})
const collections = [post, page]

describe('collection list public rendering', () => {
  it.each([
    { collection: 'missing' },
    { collection: 'listed_post', sort: { field: 'title', direction: 'asc' } },
    { collection: 'list_page', sort: { field: 'publishedAt', direction: 'desc' } },
    { collection: 'listed_post', filter: { unknown: true } },
    { collection: 'listed_post', filter: { rating: { gt: 'wrong type' } } },
  ])(
    'omits legacy schema-invalid query data while keeping the page and valid lists (%j)',
    async (invalid) => {
      const db = await createSqliteHandle({ url: ':memory:' })
      try {
        await createSchemaTables(db, collections)
        const stores = new Map<string, ContentStore>(
          collections.map((collection) => [
            collection.name,
            createContentStore({ db, collection }),
          ]),
        )
        const posts = createContentStore({ db, collection: post })
        await posts.create({
          status: 'published',
          values: {
            title: 'Later publication',
            slug: 'later',
            publishedAt: '2026-10-03T12:00:00Z',
          },
        })
        await posts.create({
          status: 'published',
          values: {
            title: 'Earlier publication',
            slug: 'earlier',
            publishedAt: '2026-10-01T12:00:00Z',
          },
        })
        await posts.create({
          status: 'published',
          values: { title: 'No publication date', slug: 'undated' },
        })
        // Direct store writes represent content saved before query validation.
        await createContentStore({ db, collection: page }).create({
          status: 'published',
          values: { title: 'Still available', slug: 'lists' },
          blocks: {
            body: [
              {
                key: 'legacy',
                type: 'collectionList',
                data: { title: 'Invalid old list', layout: 'list', ...invalid },
              },
              {
                key: 'valid',
                type: 'collectionList',
                data: {
                  collection: post.name,
                  title: 'Valid list',
                  layout: 'list',
                  sort: { field: 'publishedAt', direction: 'asc' },
                },
              },
            ],
          },
        })
        const reports: unknown[] = []
        const html = await renderRequestedPage(
          '/lists',
          {
            collections,
            gateway: createContentGateway({
              collections,
              stores,
              permissions: createPermissionLayer({ collections }),
            }),
            site: {
              name: 'Lists',
              url: 'https://example.com',
              locales: ['en'],
              defaultLocale: 'en',
            },
            styles: null,
            onInvalidCollectionList: (report) => reports.push(report),
          },
          { actor: ANONYMOUS },
        )
        const output = html ?? ''
        expect(output).toContain('Still available')
        expect(output).not.toContain('Invalid old list')
        expect(output).toContain('Valid list')
        expect(output.indexOf('Earlier publication')).toBeLessThan(
          output.indexOf('Later publication'),
        )
        expect(output.indexOf('Later publication')).toBeLessThan(
          output.indexOf('No publication date'),
        )
        expect(reports).toEqual([
          { path: '/lists', key: 'legacy', collection: invalid.collection, code: 'BLOCK_INVALID' },
        ])
      } finally {
        await db.close()
      }
    },
  )
})
