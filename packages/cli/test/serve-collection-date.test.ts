import { mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createSqliteHandle } from '@cogenta/core'
import { createContentStore, createSchemaTables, defineCollection, f } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer } from './helpers/serve-harness.js'

/**
 * L40 (ADR-0038), end to end on a real server: a page that lists **the next
 * events**, which is the whole reason a collection's own date became a sort
 * field. Two things have to be true at once for that list to be right —
 * ordered by the event's date rather than by when it was typed, and cut at
 * "now" at the moment of the request, not at the moment the page was saved.
 */

const SCHEMA_MODULE = pathToFileURL(createRequire(import.meta.url).resolve('@cogenta/schema')).href

const event = defineCollection({
  name: 'event',
  labels: { singular: 'Event', plural: 'Events' },
  routing: { pattern: '/agenda/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    startsAt: f.datetime(),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

const page = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    blocks: f.blocks({ required: true }),
  },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-collection-date-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Agenda site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
  security: { pageMaxAge: 86400 },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `import { defineCollection, f } from '${SCHEMA_MODULE}'

export default [
  defineCollection({
    name: 'event',
    labels: { singular: 'Event', plural: 'Events' },
    routing: { pattern: '/agenda/:slug' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      startsAt: f.datetime(),
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  }),
  defineCollection({
    name: 'page',
    labels: { singular: 'Page', plural: 'Pages' },
    routing: { pattern: '/:slug' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      blocks: f.blocks({ required: true }),
    },
    permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  }),
]
`,
    'utf8',
  )

  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  await createSchemaTables(db, [event, page])
  const events = createContentStore({ db, collection: event, defaultLocale: 'en' })
  const day = (offsetDays: number): string =>
    new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

  // Deliberately created in an order that has nothing to do with their dates:
  // sorting by `createdAt` would put "Last winter's gala" first.
  await events.create({
    status: 'published',
    values: { title: 'Last winter gala', slug: 'last-winter-gala', startsAt: day(-40) },
  })
  await events.create({
    status: 'published',
    values: { title: 'Autumn concert', slug: 'autumn-concert', startsAt: day(30) },
  })
  await events.create({
    status: 'published',
    values: { title: 'Spring workshop', slug: 'spring-workshop', startsAt: day(3) },
  })
  // No date at all: an event someone started typing. It must never sit at the
  // top of "what is coming", in either direction.
  await events.create({
    status: 'published',
    values: { title: 'Date to be confirmed', slug: 'date-to-be-confirmed' },
  })

  await createContentStore({ db, collection: page, defaultLocale: 'en' }).create({
    status: 'published',
    values: { title: 'Agenda', slug: 'agenda' },
    blocks: {
      blocks: [
        {
          key: 'upcoming',
          type: 'collectionList',
          data: {
            title: 'Upcoming events',
            collection: 'event',
            filter: { startsAt: { gte: '$now' } },
            sort: { field: 'startsAt', direction: 'asc' },
            limit: 10,
            layout: 'list',
          },
        },
      ],
    },
  })
  await db.close()
  return root
}

const servers: AbortController[] = []

afterEach(() => {
  for (const controller of servers.splice(0)) controller.abort()
})

describe('cogenta serve — listing a collection by its own date (L40)', () => {
  it('lists only what is still to come, in the order it will happen', async () => {
    const root = await project()
    const server = await startServer(root, { registry: servers })
    try {
      const response = await fetch(`${server.base}/agenda`)
      expect(response.status).toBe(200)
      const html = await response.text()

      const positionOf = (title: string): number => html.indexOf(title)
      expect(positionOf('Spring workshop')).toBeGreaterThan(-1)
      expect(positionOf('Autumn concert')).toBeGreaterThan(-1)
      // In three days before in thirty, whatever order they were typed in.
      expect(positionOf('Spring workshop')).toBeLessThan(positionOf('Autumn concert'))
      // Over, so gone — and undated, so not "coming" either.
      expect(html).not.toContain('Last winter gala')
      expect(html).not.toContain('Date to be confirmed')

      // The site asks for a day of shared cache; a page that says "what is
      // still to come" may not keep that answer for a day (ADR-0038).
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=0, s-maxage=3600, must-revalidate',
      )
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('leaves a page with no relative filter on the site-wide cache lifetime', async () => {
    const root = await project()
    const server = await startServer(root, { registry: servers })
    try {
      const response = await fetch(`${server.base}/agenda/spring-workshop`)
      expect(response.status).toBe(200)
      await response.text()
      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=0, s-maxage=86400, must-revalidate',
      )
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('sorts a REST listing by a declared date, empty values last', async () => {
    const root = await project()
    const server = await startServer(root, { registry: servers })
    try {
      const response = await fetch(`${server.base}/api/content/event?sort=startsAt:asc&limit=10`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: readonly { values: { title: string; startsAt?: string | null } }[]
      }
      expect(body.data.map((entry) => entry.values.title)).toEqual([
        'Last winter gala',
        'Spring workshop',
        'Autumn concert',
        'Date to be confirmed',
      ])
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('refuses to sort by a field that is not a date of that collection', async () => {
    const root = await project()
    const server = await startServer(root, { registry: servers })
    try {
      const response = await fetch(`${server.base}/api/content/event?sort=title:asc`)
      expect(response.status).toBe(400)
      const body = (await response.json()) as { error: { code: string; hint: string } }
      expect(body.error.code).toBe('CONTENT_INVALID')
      expect(body.error.hint).toContain('date')
    } finally {
      await server.stop()
    }
  }, 60_000)
})
