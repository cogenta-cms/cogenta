import { describe, expect, it, vi } from 'vitest'
import type { ContentServiceLike } from '../../../src/tools/core/content.js'
import {
  createContentDeleteTool,
  createContentPublishTool,
  createContentReadTool,
  createContentWriteDraftTool,
} from '../../../src/tools/core/content.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:writer', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeService(overrides: Partial<ContentServiceLike> = {}): ContentServiceLike {
  return {
    read: vi.fn(async () => ({ id: 'e1', status: 'working' })),
    create: vi.fn(async () => ({ id: 'e2', status: 'working' })),
    update: vi.fn(async () => ({ id: 'e1', status: 'working' })),
    publish: vi.fn(async () => ({ id: 'e1', status: 'published' })),
    remove: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('content.read', () => {
  it('reads with state defaulting to working', async () => {
    const service = fakeService()
    const tool = createContentReadTool(service)

    const result = await tool.execute({ collection: 'article', id: 'e1' }, CTX)

    expect(result).toEqual({ id: 'e1', status: 'working' })
    expect(service.read).toHaveBeenCalledWith({ actor: CTX.actor }, 'article', 'e1', {
      state: 'working',
      depth: 0,
    })
  })

  it('passes an explicit state through', async () => {
    const service = fakeService()
    const tool = createContentReadTool(service)

    await tool.execute({ collection: 'article', id: 'e1', state: 'published' }, CTX)

    expect(service.read).toHaveBeenCalledWith({ actor: CTX.actor }, 'article', 'e1', {
      state: 'published',
      depth: 0,
    })
  })

  it('declares content.read as its only permission', () => {
    const tool = createContentReadTool(fakeService())
    expect(tool.permissions).toEqual(['content.read'])
    expect(tool.sideEffects).toBe(false)
  })
})

describe('content.write_draft', () => {
  it('creates when no id is given', async () => {
    const service = fakeService()
    const tool = createContentWriteDraftTool(service)

    const result = await tool.execute({ collection: 'article', values: { title: 'New' } }, CTX)

    expect(result).toEqual({ id: 'e2', status: 'working' })
    expect(service.create).toHaveBeenCalledWith(
      { actor: CTX.actor },
      'article',
      { values: { title: 'New' } },
      { state: 'working', depth: 0 },
    )
    expect(service.update).not.toHaveBeenCalled()
  })

  it('updates when an id is given', async () => {
    const service = fakeService()
    const tool = createContentWriteDraftTool(service)

    await tool.execute({ collection: 'article', id: 'e1', values: { title: 'Edited' } }, CTX)

    expect(service.update).toHaveBeenCalledWith(
      { actor: CTX.actor },
      'article',
      'e1',
      { values: { title: 'Edited' } },
      { state: 'working', depth: 0 },
    )
    expect(service.create).not.toHaveBeenCalled()
  })

  it('is marked sideEffects and not reversible, so it requires human approval regardless of autonomy', () => {
    const tool = createContentWriteDraftTool(fakeService())
    expect(tool.sideEffects).toBe(true)
    expect(tool.reversible).toBe(false)
  })
})

describe('content.publish', () => {
  it('calls service.publish and returns the published entry', async () => {
    const service = fakeService()
    const tool = createContentPublishTool(service)

    const result = await tool.execute({ collection: 'article', id: 'e1' }, CTX)

    expect(result).toEqual({ id: 'e1', status: 'published' })
    expect(service.publish).toHaveBeenCalledWith(
      { actor: CTX.actor },
      'article',
      'e1',
      {},
      { state: 'working', depth: 0 },
    )
  })

  it('declares a rate limit', () => {
    const tool = createContentPublishTool(fakeService())
    expect(tool.rateLimit).toEqual({ perHour: 20 })
  })
})

describe('content.delete', () => {
  it('calls service.remove and reports ok', async () => {
    const service = fakeService()
    const tool = createContentDeleteTool(service)

    const result = await tool.execute({ collection: 'article', id: 'e1' }, CTX)

    expect(result).toEqual({ ok: true })
    expect(service.remove).toHaveBeenCalledWith({ actor: CTX.actor }, 'article', 'e1')
  })
})
