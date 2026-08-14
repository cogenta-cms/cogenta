import type { ContentServiceLike, ToolContext } from '@cogenta/agents'
import { describe, expect, it, vi } from 'vitest'
import { createContentDraftTool } from '../../src/content/provenance.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:content', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakeService(overrides: Partial<ContentServiceLike> = {}): ContentServiceLike {
  return {
    read: vi.fn(async () => ({})),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    publish: vi.fn(async () => ({})),
    remove: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('createContentDraftTool', () => {
  it('stamps the configured provenance on a newly created draft', async () => {
    const create = vi.fn<ContentServiceLike['create']>(async () => ({}))
    const tool = createContentDraftTool(fakeService({ create }), { provenance: 'generated' })

    await tool.execute({ collection: 'posts', values: { title: 'Hello' } }, CTX)

    expect(create.mock.calls[0]?.[2]?.values).toMatchObject({
      title: 'Hello',
      provenance: 'generated',
    })
  })

  it('overwrites a provenance value smuggled into values, never trusting the caller', async () => {
    const create = vi.fn<ContentServiceLike['create']>(async () => ({}))
    const tool = createContentDraftTool(fakeService({ create }), { provenance: 'assisted' })

    await tool.execute(
      { collection: 'posts', values: { title: 'Hello', provenance: 'human' } },
      CTX,
    )

    expect(create.mock.calls[0]?.[2]?.values.provenance).toBe('assisted')
  })

  it('also stamps provenance when updating an existing draft', async () => {
    const update = vi.fn<ContentServiceLike['update']>(async () => ({}))
    const tool = createContentDraftTool(fakeService({ update }), { provenance: 'generated' })

    await tool.execute(
      { collection: 'posts', id: 'e1', values: { title: 'Edited', provenance: 'human' } },
      CTX,
    )

    expect(update.mock.calls[0]?.[3]?.values.provenance).toBe('generated')
  })

  it('never exposes a provenance field on its own input schema', () => {
    const tool = createContentDraftTool(fakeService(), { provenance: 'generated' })
    const schema = tool.input as unknown as { shape?: Record<string, unknown> }
    expect(Object.keys(schema.shape ?? {})).not.toContain('provenance')
  })

  it('creates when no id is given, updates when one is', async () => {
    const create = vi.fn<ContentServiceLike['create']>(async () => ({}))
    const update = vi.fn<ContentServiceLike['update']>(async () => ({}))
    const tool = createContentDraftTool(fakeService({ create, update }), {
      provenance: 'generated',
    })

    await tool.execute({ collection: 'posts', values: {} }, CTX)
    expect(create).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()

    await tool.execute({ collection: 'posts', id: 'e1', values: {} }, CTX)
    expect(update).toHaveBeenCalledTimes(1)
  })
})
