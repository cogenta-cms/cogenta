import { describe, expect, it, vi } from 'vitest'
import {
  type ContentBrowseServiceLike,
  createContentCollectionsTool,
  createContentListTool,
} from '../../../src/tools/core/content-browse.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:site-monitor', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeService(overrides: Partial<ContentBrowseServiceLike> = {}): ContentBrowseServiceLike {
  return {
    collections: vi.fn(async () => [
      { collection: 'article', total: 12, published: 10, routed: true },
      { collection: 'settings', total: 1, published: 0, routed: false },
    ]),
    list: vi.fn(async () => ({
      items: [{ id: 'e1', title: 'A guide', path: '/guides/a-guide', status: 'published' }],
    })),
    ...overrides,
  }
}

describe('content.collections', () => {
  it('returns the service’s collection summaries', async () => {
    const service = fakeService()
    const tool = createContentCollectionsTool(service)

    const result = await tool.execute({}, CTX)

    expect(result).toEqual({
      collections: [
        { collection: 'article', total: 12, published: 10, routed: true },
        { collection: 'settings', total: 1, published: 0, routed: false },
      ],
    })
    expect(service.collections).toHaveBeenCalledWith({ actor: CTX.actor })
  })

  it('declares itself read-only, under content.read', () => {
    const tool = createContentCollectionsTool(fakeService())
    expect(tool.sideEffects).toBe(false)
    expect(tool.permissions).toEqual(['content.read'])
  })
})

describe('content.list', () => {
  it('lists a collection’s entries with a default limit', async () => {
    const service = fakeService()
    const tool = createContentListTool(service)

    const result = await tool.execute({ collection: 'article' }, CTX)

    expect(result).toEqual({
      items: [{ id: 'e1', title: 'A guide', path: '/guides/a-guide', status: 'published' }],
    })
    expect(service.list).toHaveBeenCalledWith({ actor: CTX.actor }, 'article', { limit: 20 })
  })

  it('passes an explicit limit through', async () => {
    const service = fakeService()
    const tool = createContentListTool(service)

    await tool.execute({ collection: 'article', limit: 5 }, CTX)

    expect(service.list).toHaveBeenCalledWith({ actor: CTX.actor }, 'article', { limit: 5 })
  })

  it('answers an empty list rather than throwing for an unknown or unreadable collection', async () => {
    const service = fakeService({ list: vi.fn(async () => undefined) })
    const tool = createContentListTool(service)

    const result = await tool.execute({ collection: 'nope' }, CTX)

    expect(result).toEqual({ items: [] })
  })

  it('declares itself read-only, under content.read', () => {
    const tool = createContentListTool(fakeService())
    expect(tool.sideEffects).toBe(false)
    expect(tool.permissions).toEqual(['content.read'])
  })
})
