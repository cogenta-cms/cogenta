import { describe, expect, it, vi } from 'vitest'
import {
  assertDecisionAllowed,
  type CommentDecisionReceipt,
  type CommentModerationPort,
  type CommentSummary,
  createCommentsDecideTool,
  createCommentsListTool,
} from '../../../src/tools/core/comments.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme-blog', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:moderation', roles: ['agent'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function comment(overrides: Partial<CommentSummary> & { id: string }): CommentSummary {
  return {
    collection: 'article',
    entryId: 'entry-1',
    authorName: 'Someone',
    body: 'An ordinary comment.',
    status: 'pending',
    flagged: false,
    severity: 'none',
    reason: '',
    createdAt: '2026-09-17T09:00:00.000Z',
    ...overrides,
  }
}

function fakePort(overrides: Partial<CommentModerationPort> = {}): CommentModerationPort {
  const restored: CommentDecisionReceipt[] = []
  return {
    pending: vi.fn(async () => [comment({ id: 'c1' })]),
    decide: vi.fn(async (id) => ({ id, previousStatus: 'pending', previousReason: 'one link' })),
    restore: vi.fn(async (receipt) => {
      restored.push(receipt)
    }),
    ...overrides,
  }
}

describe('comments.list', () => {
  it('reads the queue with the verdict the site already computed, and asks the moderation permission', async () => {
    const port = fakePort()
    const tool = createCommentsListTool(port)

    const result = await tool.execute({ limit: 5 }, CTX)

    expect(port.pending).toHaveBeenCalledWith(5)
    expect(result.comments[0]).toMatchObject({ id: 'c1', flagged: false, severity: 'none' })
    expect(tool.permissions).toEqual(['comments.moderate'])
    expect(tool.sideEffects).toBe(false)
    // A whole site's comments in one prompt is not a moderation queue.
    expect(tool.input.safeParse({ limit: 500 }).success).toBe(false)
  })
})

describe('comments.decide', () => {
  it('applies a decision and reports what it would take to undo it', async () => {
    const port = fakePort()
    const tool = createCommentsDecideTool(port)

    const result = await tool.execute(
      { id: 'c1', status: 'spam', reason: 'twelve links to the same shop' },
      CTX,
    )

    expect(port.decide).toHaveBeenCalledWith('c1', 'spam', 'twelve links to the same shop')
    expect(result).toEqual({
      id: 'c1',
      status: 'spam',
      reversible: true,
      previousStatus: 'pending',
      previousReason: 'one link',
    })
  })

  it('really reverts: revert() puts back the exact status and note the comment had (R6)', async () => {
    const port = fakePort()
    const tool = createCommentsDecideTool(port)

    const receipt = await tool.execute({ id: 'c1', status: 'spam', reason: 'spam' }, CTX)
    expect(tool.revert).toBeDefined()
    await tool.revert?.(receipt, CTX)

    expect(port.restore).toHaveBeenCalledWith({
      id: 'c1',
      previousStatus: 'pending',
      previousReason: 'one link',
    })
    // `reversible: true` without a working revert is exactly what `defineTool`
    // refuses to construct — this asserts the promise, not just the flag.
    expect(tool.reversible).toBe(true)
    expect(tool.sideEffects).toBe(true)
  })

  it('has no way to delete a comment: the vocabulary is two statuses', () => {
    const tool = createCommentsDecideTool(fakePort())

    expect(tool.input.safeParse({ id: 'c1', status: 'deleted', reason: 'x' }).success).toBe(false)
    expect(tool.input.safeParse({ id: 'c1', status: 'trash', reason: 'x' }).success).toBe(false)
    expect(tool.input.safeParse({ id: 'c1', status: 'approved', reason: 'fine' }).success).toBe(
      true,
    )
    // A decision without a reason is a decision nobody can review.
    expect(tool.input.safeParse({ id: 'c1', status: 'approved' }).success).toBe(false)
  })

  it('lets the host refuse a decision that contradicts the deterministic verdict', async () => {
    const port = fakePort({
      decide: vi.fn(async (id, status) => {
        assertDecisionAllowed({ flagged: true, severity: 'high' }, status)
        return { id, previousStatus: 'pending', previousReason: '' }
      }),
    })
    const tool = createCommentsDecideTool(port)

    await expect(
      tool.execute({ id: 'c1', status: 'approved', reason: 'looks fine to me' }, CTX),
    ).rejects.toMatchObject({ code: 'TOOL_CALL_REJECTED' })
  })
})
