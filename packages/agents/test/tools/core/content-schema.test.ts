import { describe, expect, it, vi } from 'vitest'
import {
  type CollectionSchemaSummary,
  type ContentSchemaServiceLike,
  createContentSchemaTool,
} from '../../../src/tools/core/content-schema.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:superagent', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

const ARTICLE_SCHEMA: CollectionSchemaSummary = {
  collection: 'article',
  labelSingular: 'Article',
  labelPlural: 'Articles',
  routed: true,
  fields: [
    { key: 'title', kind: 'text', label: 'Title', required: true, options: { max: 200 } },
    { key: 'body', kind: 'richText', label: null, required: false, options: {} },
  ],
}

const SETTINGS_SCHEMA: CollectionSchemaSummary = {
  collection: 'settings',
  labelSingular: 'Setting',
  labelPlural: 'Settings',
  routed: false,
  fields: [{ key: 'key', kind: 'text', label: null, required: true, options: {} }],
}

function fakeService(overrides: Partial<ContentSchemaServiceLike> = {}): ContentSchemaServiceLike {
  return {
    describe: vi.fn(async (_context, collection?: string) => {
      const all = [ARTICLE_SCHEMA, SETTINGS_SCHEMA]
      return collection === undefined ? all : all.filter((entry) => entry.collection === collection)
    }),
    ...overrides,
  }
}

describe('content.schema', () => {
  it('describes one named collection', async () => {
    const service = fakeService()
    const tool = createContentSchemaTool(service)

    const result = await tool.execute({ collection: 'article' }, CTX)

    expect(result.collections).toEqual([ARTICLE_SCHEMA])
    expect(service.describe).toHaveBeenCalledWith({ actor: CTX.actor }, 'article')
  })

  it('describes every readable collection when no collection is named', async () => {
    const service = fakeService()
    const tool = createContentSchemaTool(service)

    const result = await tool.execute({}, CTX)

    expect(result.collections).toEqual([ARTICLE_SCHEMA, SETTINGS_SCHEMA])
    expect(service.describe).toHaveBeenCalledWith({ actor: CTX.actor }, undefined)
  })

  it('omits a collection this actor cannot read, rather than throwing', async () => {
    const service = fakeService({ describe: vi.fn(async () => []) })
    const tool = createContentSchemaTool(service)

    const result = await tool.execute({ collection: 'article' }, CTX)

    expect(result.collections).toEqual([])
  })

  it('omits an unknown collection name, rather than throwing', async () => {
    const service = fakeService()
    const tool = createContentSchemaTool(service)

    const result = await tool.execute({ collection: 'does-not-exist' }, CTX)

    expect(result.collections).toEqual([])
  })

  it('always includes the block vocabulary, regardless of the collection input', async () => {
    const service = fakeService()
    const tool = createContentSchemaTool(service)

    const withCollection = await tool.execute({ collection: 'article' }, CTX)
    const withoutCollection = await tool.execute({}, CTX)

    expect(withCollection.blocks.length).toBeGreaterThan(0)
    expect(withoutCollection.blocks).toEqual(withCollection.blocks)
  })

  it('describes a known block (hero) with its real field shape', async () => {
    const service = fakeService()
    const tool = createContentSchemaTool(service)

    const result = await tool.execute({}, CTX)

    const hero = result.blocks.find((block) => block.name === 'hero')
    expect(hero).toBeDefined()
    const fieldKinds = new Map(hero?.fields.map((field) => [field.key, field.kind]))
    expect(fieldKinds.get('title')).toBe('text')
    expect(fieldKinds.get('media')).toBe('media')
    expect(fieldKinds.get('actions')).toBe('json')
    expect(hero?.fields.find((field) => field.key === 'title')?.required).toBe(true)
  })

  it('declares itself read-only, under content.read', () => {
    const tool = createContentSchemaTool(fakeService())
    expect(tool.sideEffects).toBe(false)
    expect(tool.permissions).toEqual(['content.read'])
  })
})
