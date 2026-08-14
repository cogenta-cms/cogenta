import { describe, expect, it } from 'vitest'
import { createMemoryReceiptStore } from '../../src/reversibility/receipt-store.js'
import { withReceipts, withReceiptsForManifest } from '../../src/reversibility/with-receipts.js'
import type { ExecutableTool } from '../../src/runtime/types.js'

const CTX = { signal: new AbortController().signal }

describe('withReceipts', () => {
  it('captures a receipt after a successful call of a reversible tool', async () => {
    const store = createMemoryReceiptStore()
    const publish: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      sideEffects: true,
      reversible: true,
      execute: async (input) => ({ id: input.id, url: `/entries/${input.id as string}` }),
    }
    const wrapped = withReceipts(publish, {
      agentName: 'security',
      store,
      newId: () => 'r1',
      now: () => new Date('2026-01-01T00:00:00.000Z').getTime(),
    })

    const result = await wrapped.execute({ id: 'e1' }, CTX)

    expect(result).toEqual({ id: 'e1', url: '/entries/e1' })
    const receipt = await store.get('r1')
    expect(receipt).toEqual({
      id: 'r1',
      agentName: 'security',
      toolName: 'content.publish',
      input: { id: 'e1' },
      output: { id: 'e1', url: '/entries/e1' },
      executedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('returns the same tool unchanged when reversible is not true', async () => {
    const store = createMemoryReceiptStore()
    const read: ExecutableTool = {
      spec: { name: 'content.read', description: 'Read.', inputSchema: {} },
      sideEffects: false,
      reversible: false,
      execute: async () => ({ ok: true }),
    }

    const wrapped = withReceipts(read, { agentName: 'security', store })
    await wrapped.execute({}, CTX)

    expect(await store.list()).toEqual([])
  })

  it('does not capture a receipt when the tool throws', async () => {
    const store = createMemoryReceiptStore()
    const failing: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      sideEffects: true,
      reversible: true,
      execute: async () => {
        throw new Error('boom')
      },
    }
    const wrapped = withReceipts(failing, { agentName: 'security', store })

    await expect(wrapped.execute({}, CTX)).rejects.toThrowError('boom')
    expect(await store.list()).toEqual([])
  })
})

describe('withReceiptsForManifest', () => {
  it('wraps every reversible tool in the manifest', async () => {
    const store = createMemoryReceiptStore()
    const publish: ExecutableTool = {
      spec: { name: 'content.publish', description: 'Publish.', inputSchema: {} },
      sideEffects: true,
      reversible: true,
      execute: async () => ({ ok: true }),
    }
    const manifest = withReceiptsForManifest([publish], { agentName: 'security', store })

    await manifest[0]?.execute({}, CTX)

    expect(await store.list()).toHaveLength(1)
  })
})
