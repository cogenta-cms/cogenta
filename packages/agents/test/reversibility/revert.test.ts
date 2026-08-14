import { describe, expect, it, vi } from 'vitest'
import { createMemoryReceiptStore } from '../../src/reversibility/receipt-store.js'
import { revertReceipt } from '../../src/reversibility/revert.js'
import type { ExecutableTool } from '../../src/runtime/types.js'

const CTX = { signal: new AbortController().signal }

function publishTool(revert = vi.fn(async () => undefined)): ExecutableTool {
  return {
    spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
    sideEffects: true,
    reversible: true,
    execute: async () => ({ ok: true }),
    revert,
  }
}

describe('revertReceipt', () => {
  it('calls the matching tool’s revert with the receipt’s output, and marks it reverted', async () => {
    const store = createMemoryReceiptStore()
    await store.save({
      id: 'r1',
      agentName: 'security',
      toolName: 'content.publish',
      input: { id: 'e1' },
      output: { published: 'e1' },
      executedAt: '2026-01-01T00:00:00.000Z',
    })
    const revert = vi.fn(async () => undefined)
    const tool = publishTool(revert)

    const result = await revertReceipt('r1', {
      store,
      tools: [tool],
      ctx: CTX,
      now: () => new Date('2026-01-02T00:00:00.000Z').getTime(),
    })

    expect(revert).toHaveBeenCalledWith({ published: 'e1' }, CTX)
    expect(result.revertedAt).toBe('2026-01-02T00:00:00.000Z')
    expect((await store.get('r1'))?.revertedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('throws RECEIPT_UNKNOWN for an id that was never saved', async () => {
    const store = createMemoryReceiptStore()
    await expect(revertReceipt('ghost', { store, tools: [], ctx: CTX })).rejects.toThrowError(
      /No receipt with id "ghost"/,
    )
  })

  it('throws RECEIPT_ALREADY_REVERTED for a receipt reverted once already', async () => {
    const store = createMemoryReceiptStore()
    await store.save({
      id: 'r1',
      agentName: 'security',
      toolName: 'content.publish',
      input: {},
      output: {},
      executedAt: '2026-01-01T00:00:00.000Z',
      revertedAt: '2026-01-01T01:00:00.000Z',
    })

    await expect(
      revertReceipt('r1', { store, tools: [publishTool()], ctx: CTX }),
    ).rejects.toThrowError(/already reverted/)
  })

  it('throws RECEIPT_NOT_REVERTIBLE when the matching tool has no revert()', async () => {
    const store = createMemoryReceiptStore()
    await store.save({
      id: 'r1',
      agentName: 'security',
      toolName: 'content.publish',
      input: {},
      output: {},
      executedAt: '2026-01-01T00:00:00.000Z',
    })
    const noRevert: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      execute: async () => ({}),
    }

    await expect(revertReceipt('r1', { store, tools: [noRevert], ctx: CTX })).rejects.toThrowError(
      /has no revert\(\) available/,
    )
  })

  it('throws RECEIPT_NOT_REVERTIBLE when no tool in the run matches the receipt’s tool name', async () => {
    const store = createMemoryReceiptStore()
    await store.save({
      id: 'r1',
      agentName: 'security',
      toolName: 'content.publish',
      input: {},
      output: {},
      executedAt: '2026-01-01T00:00:00.000Z',
    })

    await expect(revertReceipt('r1', { store, tools: [], ctx: CTX })).rejects.toThrowError(
      /has no revert\(\) available/,
    )
  })
})
